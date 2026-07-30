-- AutoShop Assistant schema (autoshop_ prefix avoids collision with other apps in this Supabase project)
create extension if not exists "pgcrypto";
create schema if not exists auto_repair;
set search_path = auto_repair, public;

create table if not exists autoshop_shops (
  id uuid primary key default gen_random_uuid(),
  shop_key text not null unique,
  name text not null,
  country text not null,
  locale text not null,
  currency text not null,
  timezone text not null,
  language text not null,
  email_sender_name text not null,
  email_sender_address text not null,
  address text not null,
  is_active boolean not null default false
);

create unique index if not exists autoshop_one_active_shop
  on autoshop_shops (is_active)
  where is_active = true;

create or replace function set_active_autoshop(p_shop_key text)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  target_shop autoshop_shops%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('autoshop-active-shop', 0));

  select *
    into target_shop
    from autoshop_shops
    where shop_key = p_shop_key
    for update;

  if not found then
    raise exception 'Shop not found';
  end if;

  update autoshop_shops
    set is_active = false
    where is_active = true;

  update autoshop_shops
    set is_active = true
    where id = target_shop.id
    returning * into target_shop;

  return to_jsonb(target_shop);
end;
$$;

revoke all on function set_active_autoshop(text)
  from public, anon, authenticated;
grant execute on function set_active_autoshop(text)
  to service_role;

create table if not exists autoshop_services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references autoshop_shops(id),
  name text not null,
  category text not null,
  price_min integer not null,
  price_max integer not null,
  duration_minutes integer not null,
  unique (shop_id, name)
);

create table if not exists autoshop_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references autoshop_shops(id),
  customer_name text not null,
  plate_number text not null,
  phone text not null,
  customer_email text,
  vehicle text not null,
  service_id uuid references autoshop_services(id),
  issue_description text,
  probable_issue text,
  urgency text,
  estimate_min integer,
  estimate_max integer,
  status text not null default 'booked',
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table autoshop_services add column if not exists shop_id uuid references autoshop_shops(id);
alter table autoshop_jobs add column if not exists shop_id uuid references autoshop_shops(id);
alter table autoshop_jobs add column if not exists customer_email text;

alter table autoshop_services drop constraint if exists autoshop_services_name_key;
create unique index if not exists autoshop_services_shop_name_key
  on autoshop_services (shop_id, name);

create table if not exists autoshop_status_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references autoshop_jobs(id) on delete cascade,
  status text not null,
  note text,
  action_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists autoshop_status_history_action_key
  on autoshop_status_history (action_key)
  where action_key is not null;

create table if not exists autoshop_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references autoshop_jobs(id) on delete cascade,
  kind text not null,
  body text not null,
  sent boolean not null default false,
  action_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists autoshop_messages_action_key
  on autoshop_messages (action_key)
  where action_key is not null;

create table if not exists autoshop_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references autoshop_shops(id),
  job_id uuid not null references autoshop_jobs(id) on delete cascade,
  message_id uuid references autoshop_messages(id) on delete cascade,
  template_id text not null check (
    template_id in ('status_update', 'completion_report', 'reminder', 'review_request')
  ),
  transport text not null check (transport in ('n8n', 'resend')),
  recipient text not null,
  status text not null default 'pending' check (
    status in ('pending', 'sent', 'failed', 'capped', 'reconciling')
  ),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index if not exists autoshop_email_delivery_message_key
  on autoshop_email_deliveries (message_id)
  where message_id is not null;

create index if not exists autoshop_email_delivery_cap_lookup
  on autoshop_email_deliveries (shop_id, created_at desc)
  where status in ('pending', 'sent');

create unique index if not exists autoshop_one_active_reminder_delivery
  on autoshop_email_deliveries (job_id, template_id)
  where template_id = 'reminder' and status in ('pending', 'sent');

create table if not exists autoshop_tracker_attempts (
  id uuid primary key default gen_random_uuid(),
  rate_key text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists autoshop_tracker_attempts_rate_window
  on autoshop_tracker_attempts (rate_key, attempted_at);

create or replace function check_autoshop_tracker_rate_limit(
  p_rate_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  attempt_count integer;
begin
  if p_rate_key is null or char_length(p_rate_key) <> 64
    or p_limit < 1 or p_limit > 100
    or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'Invalid tracker rate-limit parameters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_rate_key, 0));

  delete from autoshop_tracker_attempts
    where attempted_at < now() - interval '1 day';

  select count(*)
    into attempt_count
    from autoshop_tracker_attempts
    where rate_key = p_rate_key
      and attempted_at >= now() - make_interval(secs => p_window_seconds);

  if attempt_count >= p_limit then
    return false;
  end if;

  insert into autoshop_tracker_attempts (rate_key)
    values (p_rate_key);
  return true;
end;
$$;

create or replace function lookup_autoshop_job(
  p_shop_id uuid,
  p_plate text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  normalized_plate text;
  normalized_phone text;
  matched_job autoshop_jobs%rowtype;
begin
  normalized_plate := upper(regexp_replace(coalesce(p_plate, ''), '[^[:alnum:]]', '', 'g'));
  normalized_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if char_length(normalized_plate) < 2 or char_length(normalized_plate) > 16
    or char_length(normalized_phone) < 7 or char_length(normalized_phone) > 18 then
    return jsonb_build_object('job', null, 'history', '[]'::jsonb);
  end if;

  select *
    into matched_job
    from autoshop_jobs
    where shop_id = p_shop_id
      and upper(regexp_replace(plate_number, '[^[:alnum:]]', '', 'g')) = normalized_plate
      and regexp_replace(phone, '[^0-9]', '', 'g') = normalized_phone
    order by created_at desc
    limit 1;

  if not found then
    return jsonb_build_object('job', null, 'history', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'job', jsonb_build_object(
      'vehicle', matched_job.vehicle,
      'plate_number', matched_job.plate_number,
      'status', matched_job.status,
      'scheduled_at', matched_job.scheduled_at
    ),
    'history', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'status', history.status,
            'created_at', history.created_at
          )
          order by history.created_at
        )
        from autoshop_status_history as history
        where history.job_id = matched_job.id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function reserve_autoshop_email_delivery(
  p_shop_id uuid,
  p_job_id uuid,
  p_message_id uuid,
  p_template_id text,
  p_transport text,
  p_recipient text,
  p_cap integer
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  delivery autoshop_email_deliveries%rowtype;
  used_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text, 0));

  if p_message_id is not null then
    select *
      into delivery
      from autoshop_email_deliveries
      where message_id = p_message_id;

    if found then
      return jsonb_build_object('delivery', to_jsonb(delivery), 'is_new', false);
    end if;
  end if;

  select count(*)
    into used_count
    from autoshop_email_deliveries
    where shop_id = p_shop_id
      and status in ('pending', 'sent')
      and created_at >= now() - interval '24 hours';

  if used_count >= greatest(p_cap, 1) then
    insert into autoshop_email_deliveries (
      shop_id, job_id, message_id, template_id, transport, recipient, status, error
    )
    values (
      p_shop_id, p_job_id, p_message_id, p_template_id, p_transport, p_recipient,
      'capped', 'Demo send cap reached'
    )
    returning * into delivery;

    return jsonb_build_object('delivery', to_jsonb(delivery), 'is_new', false);
  end if;

  insert into autoshop_email_deliveries (
    shop_id, job_id, message_id, template_id, transport, recipient
  )
  values (
    p_shop_id, p_job_id, p_message_id, p_template_id, p_transport, p_recipient
  )
  returning * into delivery;

  return jsonb_build_object('delivery', to_jsonb(delivery), 'is_new', true);
end;
$$;

create or replace function complete_autoshop_email_delivery(
  p_delivery_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  delivery autoshop_email_deliveries%rowtype;
begin
  if p_status not in ('sent', 'failed', 'reconciling') then
    raise exception 'Invalid delivery status';
  end if;

  select *
    into delivery
    from autoshop_email_deliveries
    where id = p_delivery_id
    for update;

  if not found then
    raise exception 'Delivery not found';
  end if;

  if delivery.status = 'sent' then
    return to_jsonb(delivery);
  end if;

  if delivery.status = 'capped' then
    raise exception 'Capped delivery cannot be completed';
  end if;

  update autoshop_email_deliveries
    set status = p_status,
        provider_message_id = coalesce(
          p_provider_message_id,
          provider_message_id
        ),
        error = p_error,
        sent_at = case
          when p_status = 'sent' then coalesce(sent_at, now())
          else sent_at
        end
    where id = p_delivery_id
    returning * into delivery;

  if p_status = 'sent' and delivery.message_id is not null then
    update autoshop_messages
      set sent = true
      where id = delivery.message_id;
  end if;

  return to_jsonb(delivery);
end;
$$;

create or replace function create_autoshop_booking(
  p_shop_id uuid,
  p_customer_name text,
  p_plate_number text,
  p_phone text,
  p_customer_email text,
  p_vehicle text,
  p_service_id uuid,
  p_issue_description text,
  p_probable_issue text,
  p_urgency text,
  p_scheduled_date text,
  p_scheduled_time text
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  selected_shop autoshop_shops%rowtype;
  selected_service autoshop_services%rowtype;
  local_date date;
  local_time time;
  scheduled_at_utc timestamptz;
  created_job autoshop_jobs%rowtype;
begin
  select *
    into selected_shop
    from autoshop_shops
    where id = p_shop_id
      and is_active = true
    for share;

  if not found then
    raise exception 'STALE_SHOP';
  end if;

  if p_service_id is not null then
    select *
      into selected_service
      from autoshop_services
      where id = p_service_id
        and shop_id = selected_shop.id;
    if not found then
      raise exception 'INVALID_SERVICE';
    end if;
  end if;

  begin
    local_date := p_scheduled_date::date;
    local_time := p_scheduled_time::time;
    scheduled_at_utc := (local_date + local_time) at time zone selected_shop.timezone;
  exception when others then
    raise exception 'INVALID_SCHEDULE';
  end;

  if scheduled_at_utc <= now() then
    raise exception 'INVALID_SCHEDULE';
  end if;

  insert into autoshop_jobs (
    shop_id,
    customer_name,
    plate_number,
    phone,
    customer_email,
    vehicle,
    service_id,
    issue_description,
    probable_issue,
    urgency,
    estimate_min,
    estimate_max,
    scheduled_at
  )
  values (
    selected_shop.id,
    p_customer_name,
    upper(p_plate_number),
    p_phone,
    lower(p_customer_email),
    p_vehicle,
    p_service_id,
    p_issue_description,
    p_probable_issue,
    p_urgency,
    case when p_service_id is null then null else selected_service.price_min end,
    case when p_service_id is null then null else selected_service.price_max end,
    scheduled_at_utc
  )
  returning * into created_job;

  insert into autoshop_status_history (job_id, status, note)
    values (created_job.id, 'booked', 'Booked via customer portal');

  return to_jsonb(created_job);
end;
$$;

create or replace function transition_autoshop_job(
  p_job_id uuid,
  p_shop_id uuid,
  p_expected_status text,
  p_target_status text,
  p_draft_body text,
  p_transport text,
  p_recipient text,
  p_cap integer
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  action_key_value text;
  expected_target text;
  current_job autoshop_jobs%rowtype;
  status_message autoshop_messages%rowtype;
  email_delivery autoshop_email_deliveries%rowtype;
  reservation jsonb;
begin
  action_key_value := format(
    'status:%s:%s:%s',
    p_job_id,
    p_expected_status,
    p_target_status
  );

  select *
    into status_message
    from autoshop_messages
    where action_key = action_key_value;

  if found then
    select * into current_job from autoshop_jobs where id = p_job_id;
    select *
      into email_delivery
      from autoshop_email_deliveries
      where message_id = status_message.id;
    return jsonb_build_object(
      'is_replay', true,
      'job', to_jsonb(current_job),
      'message', to_jsonb(status_message),
      'delivery', to_jsonb(email_delivery)
    );
  end if;

  select *
    into current_job
    from autoshop_jobs
    where id = p_job_id
      and shop_id = p_shop_id
    for update;

  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if current_job.status <> p_expected_status then
    return jsonb_build_object(
      'conflict', true,
      'current_status', current_job.status
    );
  end if;

  expected_target := case p_expected_status
    when 'booked' then 'in_progress'
    when 'in_progress' then 'waiting_parts'
    when 'waiting_parts' then 'ready'
    when 'ready' then 'done'
    else null
  end;

  if expected_target is null or p_target_status <> expected_target then
    return jsonb_build_object(
      'conflict', true,
      'current_status', current_job.status
    );
  end if;

  if p_draft_body is null or char_length(trim(p_draft_body)) = 0 then
    raise exception 'DRAFT_REQUIRED';
  end if;

  update autoshop_jobs
    set status = p_target_status
    where id = current_job.id
    returning * into current_job;

  insert into autoshop_status_history (
    job_id,
    status,
    note,
    action_key
  )
  values (
    current_job.id,
    p_target_status,
    'Status updated via admin board',
    action_key_value
  );

  insert into autoshop_messages (
    job_id,
    kind,
    body,
    sent,
    action_key
  )
  values (
    current_job.id,
    'status_update',
    trim(p_draft_body),
    false,
    action_key_value
  )
  returning * into status_message;

  reservation := reserve_autoshop_email_delivery(
    p_shop_id,
    current_job.id,
    status_message.id,
    'status_update',
    p_transport,
    p_recipient,
    p_cap
  );

  email_delivery := jsonb_populate_record(
    null::autoshop_email_deliveries,
    reservation->'delivery'
  );

  return jsonb_build_object(
    'is_replay', false,
    'job', to_jsonb(current_job),
    'message', to_jsonb(status_message),
    'delivery', to_jsonb(email_delivery)
  );
end;
$$;

alter table autoshop_shops enable row level security;
alter table autoshop_services enable row level security;
alter table autoshop_jobs enable row level security;
alter table autoshop_status_history enable row level security;
alter table autoshop_messages enable row level security;
alter table autoshop_email_deliveries enable row level security;
alter table autoshop_tracker_attempts enable row level security;

drop policy if exists "public read autoshop_shops" on autoshop_shops;
create policy "public read autoshop_shops" on autoshop_shops for select using (true);

drop policy if exists "public read autoshop_services" on autoshop_services;
create policy "public read autoshop_services" on autoshop_services for select using (true);

drop policy if exists "public read autoshop_jobs" on autoshop_jobs;

drop policy if exists "public read autoshop_status_history" on autoshop_status_history;

drop policy if exists "public read sent autoshop_messages" on autoshop_messages;

grant usage on schema auto_repair to anon, authenticated, service_role;
revoke all on all tables in schema auto_repair from anon, authenticated;
revoke all on all routines in schema auto_repair from anon, authenticated;
revoke all on all sequences in schema auto_repair from anon, authenticated;
grant select on autoshop_shops, autoshop_services to anon, authenticated;
grant all on all tables in schema auto_repair to service_role;
grant all on all routines in schema auto_repair to service_role;
grant all on all sequences in schema auto_repair to service_role;

revoke all on function check_autoshop_tracker_rate_limit(
  text, integer, integer
) from public, anon, authenticated;
grant execute on function check_autoshop_tracker_rate_limit(
  text, integer, integer
) to service_role;

revoke all on function lookup_autoshop_job(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function lookup_autoshop_job(
  uuid, text, text
) to service_role;

revoke all on function reserve_autoshop_email_delivery(
  uuid, uuid, uuid, text, text, text, integer
) from public, anon, authenticated;
grant execute on function reserve_autoshop_email_delivery(
  uuid, uuid, uuid, text, text, text, integer
) to service_role;

revoke all on function complete_autoshop_email_delivery(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function complete_autoshop_email_delivery(
  uuid, text, text, text
) to service_role;

revoke all on function create_autoshop_booking(
  uuid, text, text, text, text, text, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function create_autoshop_booking(
  uuid, text, text, text, text, text, uuid, text, text, text, text, text
) to service_role;

revoke all on function transition_autoshop_job(
  uuid, uuid, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function transition_autoshop_job(
  uuid, uuid, text, text, text, text, text, integer
) to service_role;

alter default privileges for role postgres in schema auto_repair
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema auto_repair
  revoke all on routines from anon, authenticated;
alter default privileges for role postgres in schema auto_repair
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema auto_repair
  grant all on tables to service_role;
alter default privileges for role postgres in schema auto_repair
  grant all on routines to service_role;
alter default privileges for role postgres in schema auto_repair
  grant all on sequences to service_role;

notify pgrst, 'reload schema';
