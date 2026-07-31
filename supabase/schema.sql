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
  tagline text not null check (
    char_length(trim(tagline)) between 1 and 160
  ),
  phone text not null check (
    char_length(trim(phone)) between 1 and 40
  ),
  hours text not null check (
    char_length(trim(hours)) between 1 and 160
  ),
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

create table if not exists autoshop_technicians (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references autoshop_shops(id) on delete cascade,
  name text not null check (
    char_length(trim(name)) between 1 and 100
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shop_id, name)
);

create unique index if not exists autoshop_technicians_id_shop_key
  on autoshop_technicians (id, shop_id);

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
  booking_idempotency_key uuid,
  technician_id uuid,
  created_at timestamptz not null default now()
);

alter table autoshop_services add column if not exists shop_id uuid references autoshop_shops(id);
alter table autoshop_jobs add column if not exists shop_id uuid references autoshop_shops(id);
alter table autoshop_jobs add column if not exists customer_email text;
alter table autoshop_jobs add column if not exists booking_idempotency_key uuid;
alter table autoshop_jobs add column if not exists technician_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
      where conname = 'autoshop_jobs_technician_shop_fk'
        and conrelid = 'autoshop_jobs'::regclass
  ) then
    alter table autoshop_jobs
      add constraint autoshop_jobs_technician_shop_fk
      foreign key (technician_id, shop_id)
      references autoshop_technicians (id, shop_id);
  end if;
end;
$$;

create unique index if not exists autoshop_jobs_booking_idempotency_key
  on autoshop_jobs (shop_id, booking_idempotency_key)
  where booking_idempotency_key is not null;

create index if not exists autoshop_jobs_technician_lookup
  on autoshop_jobs (shop_id, technician_id, status);

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
    template_id in (
      'status_update', 'completion_report', 'reminder', 'review_request',
      'extra_work_approval'
    )
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
  where template_id = 'reminder'
    and status in ('pending', 'sent', 'reconciling');

create table if not exists autoshop_approval_requests (
  id uuid primary key,
  shop_id uuid not null references autoshop_shops(id) on delete cascade,
  job_id uuid not null references autoshop_jobs(id) on delete cascade,
  message_id uuid unique references autoshop_messages(id) on delete set null,
  description text not null check (
    char_length(trim(description)) between 1 and 1000
  ),
  line_items jsonb not null check (
    jsonb_typeof(line_items) = 'array' and jsonb_array_length(line_items) > 0
  ),
  amount integer not null check (amount > 0),
  customer_explanation text not null check (
    char_length(trim(customer_explanation)) between 1 and 4000
  ),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'declined', 'expired')
  ),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'pending' and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  )
);

create unique index if not exists autoshop_one_pending_approval_per_job
  on autoshop_approval_requests (job_id)
  where status = 'pending';

create index if not exists autoshop_approvals_shop_status
  on autoshop_approval_requests (shop_id, status, created_at desc);

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'auto-repair-intake-photos',
  'auto-repair-intake-photos',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists autoshop_intake_photos (
  id uuid primary key,
  shop_id uuid not null references autoshop_shops(id) on delete cascade,
  job_id uuid references autoshop_jobs(id) on delete cascade,
  intake_key_hash text not null check (
    intake_key_hash ~ '^[0-9a-f]{64}$'
  ),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique,
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  size_bytes integer not null check (
    size_bytes between 1 and 4194304
  ),
  status text not null default 'uploading' check (
    status in ('uploading', 'ready', 'deleting')
  ),
  created_at timestamptz not null default now(),
  attached_at timestamptz
);

create index if not exists autoshop_intake_photos_session
  on autoshop_intake_photos (shop_id, intake_key_hash, status);
create index if not exists autoshop_intake_photos_job
  on autoshop_intake_photos (job_id)
  where job_id is not null;

create table if not exists autoshop_intake_sessions (
  id uuid primary key,
  shop_id uuid not null references autoshop_shops(id) on delete cascade,
  job_id uuid unique references autoshop_jobs(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  booked_at timestamptz,
  check (completed_at is null or completed_at >= started_at),
  check (
    (job_id is null and booked_at is null)
    or (job_id is not null and completed_at is not null and booked_at is not null)
  )
);

create index if not exists autoshop_intake_sessions_shop_started
  on autoshop_intake_sessions (shop_id, started_at desc);

create table if not exists autoshop_tracker_attempts (
  id uuid primary key default gen_random_uuid(),
  rate_key text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists autoshop_tracker_attempts_rate_window
  on autoshop_tracker_attempts (rate_key, attempted_at);

create table if not exists autoshop_api_attempts (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  rate_key text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists autoshop_api_attempts_lookup
  on autoshop_api_attempts (bucket, rate_key, attempted_at desc);

create index if not exists autoshop_api_attempts_cleanup
  on autoshop_api_attempts (attempted_at);

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

create or replace function check_autoshop_api_rate_limit(
  p_bucket text,
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
  recent_attempts integer;
begin
  if p_bucket not in (
      'admin-login', 'booking', 'triage', 'approval-decision', 'photo-upload'
    )
    or p_rate_key !~ '^[0-9a-f]{64}$'
    or p_limit < 1
    or p_limit > 100
    or p_window_seconds < 1
    or p_window_seconds > 86400 then
    raise exception 'INVALID_RATE_LIMIT_ARGUMENTS';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_bucket || ':' || p_rate_key, 0)
  );

  delete from autoshop_api_attempts
    where attempted_at < now() - interval '24 hours';

  select count(*)
    into recent_attempts
    from autoshop_api_attempts
    where bucket = p_bucket
      and rate_key = p_rate_key
      and attempted_at >= now() - make_interval(secs => p_window_seconds);

  if recent_attempts >= p_limit then
    return false;
  end if;

  insert into autoshop_api_attempts (bucket, rate_key)
    values (p_bucket, p_rate_key);
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

drop function if exists create_autoshop_booking(
  uuid, text, text, text, text, text, uuid, text, text, text, text, text
);

create function create_autoshop_booking(
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
  p_scheduled_time text,
  p_idempotency_key uuid
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
  booking_duration_minutes integer;
  created_job autoshop_jobs%rowtype;
begin
  if p_idempotency_key is null then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      format(
        'autoshop-booking-key:%s:%s',
        p_shop_id,
        p_idempotency_key
      ),
      0
    )
  );

  select *
    into created_job
    from autoshop_jobs
    where shop_id = p_shop_id
      and booking_idempotency_key = p_idempotency_key;

  if found then
    return to_jsonb(created_job);
  end if;

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

  booking_duration_minutes := case
    when p_service_id is null then 60
    else selected_service.duration_minutes
  end;

  perform pg_advisory_xact_lock(
    hashtextextended(
      format('autoshop-booking-capacity:%s:%s', selected_shop.id, local_date),
      0
    )
  );

  if exists (
    select 1
      from autoshop_jobs existing_job
      left join autoshop_services existing_service
        on existing_service.id = existing_job.service_id
      where existing_job.shop_id = selected_shop.id
        and existing_job.status <> 'done'
        and existing_job.scheduled_at is not null
        and existing_job.scheduled_at
          < scheduled_at_utc
            + make_interval(mins => booking_duration_minutes)
        and existing_job.scheduled_at
            + make_interval(
                mins => coalesce(existing_service.duration_minutes, 60)
              )
          > scheduled_at_utc
  ) then
    raise exception 'SLOT_UNAVAILABLE';
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
    scheduled_at,
    booking_idempotency_key
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
    scheduled_at_utc,
    p_idempotency_key
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

create or replace function assign_autoshop_technician(
  p_job_id uuid,
  p_shop_id uuid,
  p_technician_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  target_job autoshop_jobs%rowtype;
begin
  select *
    into target_job
    from autoshop_jobs
    where id = p_job_id
      and shop_id = p_shop_id
    for update;

  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if p_technician_id is not null and not exists (
    select 1
      from autoshop_technicians
      where id = p_technician_id
        and shop_id = p_shop_id
        and is_active = true
  ) then
    raise exception 'TECHNICIAN_NOT_FOUND';
  end if;

  update autoshop_jobs
    set technician_id = p_technician_id
    where id = target_job.id
    returning * into target_job;

  return to_jsonb(target_job);
end;
$$;

create or replace function create_autoshop_approval_request(
  p_request_id uuid,
  p_shop_id uuid,
  p_job_id uuid,
  p_service_id uuid,
  p_description text,
  p_amount integer,
  p_customer_explanation text,
  p_token_hash text,
  p_expires_at timestamptz,
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
  target_job autoshop_jobs%rowtype;
  target_service autoshop_services%rowtype;
  approval autoshop_approval_requests%rowtype;
  approval_message autoshop_messages%rowtype;
  delivery autoshop_email_deliveries%rowtype;
  reservation jsonb;
begin
  if p_request_id is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_APPROVAL_REQUEST';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('autoshop-approval:' || p_request_id::text, 0)
  );
  select * into approval
    from autoshop_approval_requests where id = p_request_id;
  if found then
    if approval.shop_id <> p_shop_id
      or approval.job_id <> p_job_id
      or approval.description <> trim(p_description)
      or approval.amount <> p_amount
      or approval.token_hash <> p_token_hash
      or approval.line_items->0->>'service_id' <> p_service_id::text then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    select * into approval_message
      from autoshop_messages where id = approval.message_id;
    select * into delivery
      from autoshop_email_deliveries where message_id = approval.message_id;
    return jsonb_build_object(
      'is_replay', true, 'approval', to_jsonb(approval),
      'message', to_jsonb(approval_message), 'delivery', to_jsonb(delivery)
    );
  end if;

  select * into target_job
    from autoshop_jobs
    where id = p_job_id and shop_id = p_shop_id
    for update;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if target_job.status not in ('in_progress', 'waiting_parts') then
    raise exception 'JOB_NOT_ACTIVE';
  end if;
  if target_job.customer_email is null then
    raise exception 'CUSTOMER_EMAIL_REQUIRED';
  end if;

  update autoshop_approval_requests
    set status = 'expired', decided_at = now()
    where job_id = p_job_id and status = 'pending' and expires_at <= now();
  if exists (
    select 1 from autoshop_approval_requests
    where job_id = p_job_id and status = 'pending'
  ) then
    raise exception 'APPROVAL_ALREADY_PENDING';
  end if;

  select * into target_service
    from autoshop_services
    where id = p_service_id and shop_id = p_shop_id;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
  if p_amount < target_service.price_min or p_amount > target_service.price_max then
    raise exception 'AMOUNT_OUTSIDE_SERVICE_RANGE';
  end if;
  if char_length(trim(coalesce(p_description, ''))) not between 1 and 1000
    or char_length(trim(coalesce(p_customer_explanation, ''))) not between 1 and 4000
    or p_expires_at <= now()
    or p_expires_at > now() + interval '7 days' then
    raise exception 'INVALID_APPROVAL_REQUEST';
  end if;

  insert into autoshop_approval_requests (
    id, shop_id, job_id, description, line_items, amount,
    customer_explanation, token_hash, expires_at
  ) values (
    p_request_id, p_shop_id, p_job_id, trim(p_description),
    jsonb_build_array(jsonb_build_object(
      'service_id', target_service.id,
      'name', target_service.name,
      'amount', p_amount
    )),
    p_amount, trim(p_customer_explanation), p_token_hash, p_expires_at
  ) returning * into approval;

  insert into autoshop_messages (job_id, kind, body, sent, action_key)
    values (
      p_job_id, 'extra_work_approval', trim(p_customer_explanation), false,
      'approval:' || p_request_id::text
    )
    returning * into approval_message;
  update autoshop_approval_requests
    set message_id = approval_message.id
    where id = approval.id
    returning * into approval;

  reservation := reserve_autoshop_email_delivery(
    p_shop_id, p_job_id, approval_message.id, 'extra_work_approval',
    p_transport, p_recipient, p_cap
  );
  delivery := jsonb_populate_record(
    null::autoshop_email_deliveries, reservation->'delivery'
  );
  if delivery.status = 'capped' then
    raise exception 'APPROVAL_DELIVERY_CAPPED';
  end if;
  return jsonb_build_object(
    'is_replay', false, 'approval', to_jsonb(approval),
    'message', to_jsonb(approval_message), 'delivery', to_jsonb(delivery)
  );
end;
$$;

create or replace function decide_autoshop_approval(
  p_request_id uuid,
  p_token_hash text,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  approval autoshop_approval_requests%rowtype;
  target_job autoshop_jobs%rowtype;
begin
  if p_decision not in ('approved', 'declined') then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  select * into approval
    from autoshop_approval_requests
    where id = p_request_id and token_hash = p_token_hash
    for update;
  if not found then return jsonb_build_object('outcome', 'invalid'); end if;
  if approval.status <> 'pending' then
    return jsonb_build_object(
      'outcome', 'already_decided', 'approval', to_jsonb(approval)
    );
  end if;
  if approval.expires_at <= now() then
    update autoshop_approval_requests
      set status = 'expired', decided_at = now()
      where id = approval.id
      returning * into approval;
    return jsonb_build_object(
      'outcome', 'expired', 'approval', to_jsonb(approval)
    );
  end if;

  select * into target_job
    from autoshop_jobs
    where id = approval.job_id and shop_id = approval.shop_id
    for update;
  if not found then return jsonb_build_object('outcome', 'invalid'); end if;
  if target_job.status not in ('in_progress', 'waiting_parts') then
    return jsonb_build_object(
      'outcome', 'conflict',
      'current_status', target_job.status
    );
  end if;
  update autoshop_approval_requests
    set status = p_decision, decided_at = now()
    where id = approval.id
    returning * into approval;
  update autoshop_jobs
    set status = 'in_progress'
    where id = target_job.id
    returning * into target_job;
  insert into autoshop_status_history (job_id, status, note, action_key)
    values (
      target_job.id, 'in_progress',
      case p_decision
        when 'approved' then 'Customer approved extra work'
        else 'Customer declined extra work'
      end,
      'approval-decision:' || approval.id::text
    );
  return jsonb_build_object(
    'outcome', p_decision, 'approval', to_jsonb(approval),
    'job', to_jsonb(target_job)
  );
end;
$$;

create or replace function reserve_autoshop_intake_photo(
  p_photo_id uuid,
  p_shop_id uuid,
  p_intake_key_hash text,
  p_content_hash text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  photo autoshop_intake_photos%rowtype;
  expected_extension text;
begin
  if p_photo_id is null
    or p_intake_key_hash !~ '^[0-9a-f]{64}$'
    or p_content_hash !~ '^[0-9a-f]{64}$'
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_size_bytes < 1
    or p_size_bytes > 4194304 then
    raise exception 'INVALID_INTAKE_PHOTO';
  end if;
  if not exists (
    select 1 from autoshop_shops
    where id = p_shop_id and is_active = true
  ) then
    raise exception 'STALE_SHOP';
  end if;
  expected_extension := case p_mime_type
    when 'image/jpeg' then '.jpg'
    when 'image/png' then '.png'
    when 'image/webp' then '.webp'
  end;
  if p_storage_path <> (
    p_shop_id::text || '/' || p_intake_key_hash || '/' ||
    p_photo_id::text || expected_extension
  ) then
    raise exception 'INVALID_STORAGE_PATH';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'autoshop-intake:' || p_shop_id::text || ':' || p_intake_key_hash,
      0
    )
  );
  select * into photo from autoshop_intake_photos where id = p_photo_id;
  if found then
    if photo.shop_id <> p_shop_id
      or photo.intake_key_hash <> p_intake_key_hash
      or photo.content_hash <> p_content_hash
      or photo.storage_path <> p_storage_path
      or photo.mime_type <> p_mime_type
      or photo.size_bytes <> p_size_bytes then
      raise exception 'PHOTO_ID_CONFLICT';
    end if;
    return to_jsonb(photo);
  end if;
  if (
    select count(*) from autoshop_intake_photos
    where shop_id = p_shop_id
      and intake_key_hash = p_intake_key_hash
      and job_id is null
  ) >= 3 then
    raise exception 'PHOTO_LIMIT_REACHED';
  end if;
  insert into autoshop_intake_photos (
    id, shop_id, intake_key_hash, content_hash, storage_path, mime_type, size_bytes
  ) values (
    p_photo_id, p_shop_id, p_intake_key_hash, p_content_hash, p_storage_path,
    p_mime_type, p_size_bytes
  )
  returning * into photo;
  return to_jsonb(photo);
end;
$$;

create or replace function complete_autoshop_intake_photo(
  p_photo_id uuid,
  p_intake_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  photo autoshop_intake_photos%rowtype;
begin
  select * into photo
    from autoshop_intake_photos
    where id = p_photo_id and intake_key_hash = p_intake_key_hash;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(
      'autoshop-intake:' || photo.shop_id::text || ':' || p_intake_key_hash,
      0
    )
  );
  update autoshop_intake_photos
    set status = 'ready'
    where id = p_photo_id
      and intake_key_hash = p_intake_key_hash
      and job_id is null
      and status in ('uploading', 'ready')
    returning * into photo;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  return to_jsonb(photo);
end;
$$;

create or replace function claim_autoshop_intake_photo_deletion(
  p_photo_id uuid,
  p_intake_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  photo autoshop_intake_photos%rowtype;
begin
  select * into photo
    from autoshop_intake_photos
    where id = p_photo_id and intake_key_hash = p_intake_key_hash;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(
      'autoshop-intake:' || photo.shop_id::text || ':' || p_intake_key_hash,
      0
    )
  );
  select * into photo
    from autoshop_intake_photos
    where id = p_photo_id and intake_key_hash = p_intake_key_hash
    for update;
  if not found or photo.job_id is not null
    or photo.status not in ('uploading', 'ready', 'deleting') then
    raise exception 'PHOTO_NOT_FOUND';
  end if;
  if photo.status = 'ready' then
    update autoshop_intake_photos
      set status = 'deleting'
      where id = photo.id
      returning * into photo;
  end if;
  return to_jsonb(photo);
end;
$$;

create or replace function finalize_autoshop_intake_photo_deletion(
  p_photo_id uuid,
  p_intake_key_hash text
)
returns boolean
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  photo autoshop_intake_photos%rowtype;
  deleted_count integer;
begin
  select * into photo
    from autoshop_intake_photos
    where id = p_photo_id and intake_key_hash = p_intake_key_hash;
  if not found then return true; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(
      'autoshop-intake:' || photo.shop_id::text || ':' || p_intake_key_hash,
      0
    )
  );
  delete from autoshop_intake_photos
    where id = p_photo_id
      and intake_key_hash = p_intake_key_hash
      and job_id is null
      and status = 'deleting'
    returning * into photo;
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

create or replace function create_autoshop_booking_with_photos(
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
  p_scheduled_time text,
  p_idempotency_key uuid,
  p_intake_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  created_job jsonb;
  created_job_id uuid;
  ready_count integer;
begin
  created_job := create_autoshop_booking(
    p_shop_id, p_customer_name, p_plate_number, p_phone, p_customer_email,
    p_vehicle, p_service_id, p_issue_description, p_probable_issue, p_urgency,
    p_scheduled_date, p_scheduled_time, p_idempotency_key
  );
  created_job_id := (created_job->>'id')::uuid;
  if p_intake_key_hash is null then return created_job; end if;
  if p_intake_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INTAKE_PHOTOS';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(
      'autoshop-intake:' || p_shop_id::text || ':' || p_intake_key_hash,
      0
    )
  );
  if exists (
    select 1 from autoshop_intake_photos
    where shop_id = p_shop_id
      and intake_key_hash = p_intake_key_hash
      and job_id is not null
      and job_id <> created_job_id
  ) then
    raise exception 'INTAKE_PHOTOS_ALREADY_ATTACHED';
  end if;
  if exists (
    select 1 from autoshop_intake_photos
    where job_id = created_job_id
      and intake_key_hash <> p_intake_key_hash
  ) then
    raise exception 'BOOKING_PHOTO_CONFLICT';
  end if;
  select count(*) into ready_count
    from autoshop_intake_photos
    where shop_id = p_shop_id
      and intake_key_hash = p_intake_key_hash
      and status = 'ready'
      and (job_id is null or job_id = created_job_id);
  if ready_count < 1 or ready_count > 3 then
    raise exception 'INVALID_INTAKE_PHOTOS';
  end if;
  update autoshop_intake_photos
    set job_id = created_job_id,
        attached_at = coalesce(attached_at, now())
    where shop_id = p_shop_id
      and intake_key_hash = p_intake_key_hash
      and status = 'ready'
      and job_id is null;
  if (
    select count(*) from autoshop_intake_photos
    where job_id = created_job_id and status = 'ready'
  ) > 3 then
    raise exception 'PHOTO_LIMIT_REACHED';
  end if;
  return created_job;
end;
$$;

create or replace function record_autoshop_intake_session(
  p_session_id uuid,
  p_shop_id uuid,
  p_completed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  intake_session autoshop_intake_sessions%rowtype;
begin
  if p_session_id is null or p_shop_id is null or p_completed is null then
    raise exception 'INVALID_INTAKE_SESSION';
  end if;
  if not exists (
    select 1 from autoshop_shops
    where id = p_shop_id and is_active = true
  ) then
    raise exception 'STALE_SHOP';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('autoshop-intake-session:' || p_session_id::text, 0)
  );
  select * into intake_session
    from autoshop_intake_sessions
    where id = p_session_id
    for update;
  if found then
    if intake_session.shop_id <> p_shop_id then
      raise exception 'INTAKE_SESSION_CONFLICT';
    end if;
    if p_completed and intake_session.completed_at is null then
      update autoshop_intake_sessions
        set completed_at = now()
        where id = p_session_id
        returning * into intake_session;
    end if;
    return to_jsonb(intake_session);
  end if;
  insert into autoshop_intake_sessions (id, shop_id, completed_at)
    values (
      p_session_id,
      p_shop_id,
      case when p_completed then now() else null end
    )
    returning * into intake_session;
  return to_jsonb(intake_session);
end;
$$;

create or replace function create_autoshop_booking_with_photos(
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
  p_scheduled_time text,
  p_idempotency_key uuid,
  p_intake_key_hash text,
  p_intake_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  created_job jsonb;
  created_job_id uuid;
  intake_session autoshop_intake_sessions%rowtype;
begin
  created_job := create_autoshop_booking_with_photos(
    p_shop_id, p_customer_name, p_plate_number, p_phone, p_customer_email,
    p_vehicle, p_service_id, p_issue_description, p_probable_issue, p_urgency,
    p_scheduled_date, p_scheduled_time, p_idempotency_key, p_intake_key_hash
  );
  if p_intake_session_id is null then return created_job; end if;
  created_job_id := (created_job->>'id')::uuid;
  select * into intake_session
    from autoshop_intake_sessions
    where id = p_intake_session_id
    for update;
  if not found
    or intake_session.shop_id <> p_shop_id
    or intake_session.completed_at is null then
    raise exception 'INVALID_INTAKE_SESSION';
  end if;
  if intake_session.job_id is not null
    and intake_session.job_id <> created_job_id then
    raise exception 'INTAKE_SESSION_ALREADY_BOOKED';
  end if;
  update autoshop_intake_sessions
    set job_id = created_job_id,
        booked_at = coalesce(booked_at, now())
    where id = p_intake_session_id;
  return created_job;
end;
$$;

create or replace function get_autoshop_dashboard_metrics(
  p_shop_id uuid,
  p_days integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = auto_repair, public
as $$
declare
  shop_timezone text;
  period_start timestamptz;
  jobs_total integer;
  booked_min bigint;
  booked_max bigint;
  average_min numeric;
  average_max numeric;
  intakes_completed integer;
  intakes_booked integer;
  approvals_decided integer;
  approvals_approved integer;
  reminders_sent integer;
  current_unassigned integer;
  status_counts jsonb;
  technician_workload jsonb;
begin
  if p_days not in (7, 30, 90) then
    raise exception 'INVALID_DASHBOARD_RANGE';
  end if;
  select timezone into shop_timezone
    from autoshop_shops
    where id = p_shop_id;
  if not found then raise exception 'SHOP_NOT_FOUND'; end if;
  period_start := (
    date_trunc('day', now() at time zone shop_timezone)
    - make_interval(days => p_days - 1)
  ) at time zone shop_timezone;

  select
    count(*)::integer,
    coalesce(sum(estimate_min), 0)::bigint,
    coalesce(sum(estimate_max), 0)::bigint,
    coalesce(avg(estimate_min), 0),
    coalesce(avg(estimate_max), 0)
  into jobs_total, booked_min, booked_max, average_min, average_max
  from autoshop_jobs
  where shop_id = p_shop_id and created_at >= period_start;

  select jsonb_build_object(
    'booked', count(*) filter (where status = 'booked'),
    'in_progress', count(*) filter (where status = 'in_progress'),
    'waiting_parts', count(*) filter (where status = 'waiting_parts'),
    'ready', count(*) filter (where status = 'ready'),
    'done', count(*) filter (where status = 'done')
  ) into status_counts
  from autoshop_jobs
  where shop_id = p_shop_id and created_at >= period_start;

  select
    count(*)::integer,
    count(*) filter (where job_id is not null)::integer
  into intakes_completed, intakes_booked
  from autoshop_intake_sessions
  where shop_id = p_shop_id
    and started_at >= period_start
    and completed_at is not null;

  select
    count(*)::integer,
    count(*) filter (where status = 'approved')::integer
  into approvals_decided, approvals_approved
  from autoshop_approval_requests
  where shop_id = p_shop_id
    and status in ('approved', 'declined')
    and decided_at >= period_start;

  select count(*)::integer into reminders_sent
  from autoshop_email_deliveries
  where shop_id = p_shop_id
    and template_id = 'reminder'
    and status = 'sent'
    and sent_at >= period_start;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', technician.id,
        'name', technician.name,
        'active_jobs', technician.active_jobs
      )
      order by technician.active_jobs desc, technician.name
    ),
    '[]'::jsonb
  ) into technician_workload
  from (
    select t.id, t.name, count(j.id)::integer as active_jobs
    from autoshop_technicians t
    left join autoshop_jobs j
      on j.technician_id = t.id
      and j.shop_id = t.shop_id
      and j.status <> 'done'
    where t.shop_id = p_shop_id and t.is_active = true
    group by t.id, t.name
  ) technician;

  select count(*)::integer into current_unassigned
  from autoshop_jobs
  where shop_id = p_shop_id
    and technician_id is null
    and status <> 'done';

  return jsonb_build_object(
    'period_days', p_days,
    'period_start', period_start,
    'jobs_total', jobs_total,
    'jobs_by_status', status_counts,
    'estimated_booked_value', jsonb_build_object(
      'minimum', booked_min, 'maximum', booked_max
    ),
    'estimated_average_ticket', jsonb_build_object(
      'minimum', round(average_min, 2), 'maximum', round(average_max, 2)
    ),
    'intake_conversion', jsonb_build_object(
      'completed', intakes_completed,
      'booked', intakes_booked,
      'rate', case when intakes_completed = 0 then 0
        else round(intakes_booked::numeric * 100 / intakes_completed, 1) end
    ),
    'approval_acceptance', jsonb_build_object(
      'decided', approvals_decided,
      'approved', approvals_approved,
      'rate', case when approvals_decided = 0 then 0
        else round(approvals_approved::numeric * 100 / approvals_decided, 1) end
    ),
    'reminders_sent', reminders_sent,
    'technician_workload', technician_workload,
    'current_unassigned_jobs', current_unassigned
  );
end;
$$;

alter table autoshop_shops enable row level security;
alter table autoshop_services enable row level security;
alter table autoshop_technicians enable row level security;
alter table autoshop_jobs enable row level security;
alter table autoshop_status_history enable row level security;
alter table autoshop_messages enable row level security;
alter table autoshop_email_deliveries enable row level security;
alter table autoshop_tracker_attempts enable row level security;
alter table autoshop_api_attempts enable row level security;
alter table autoshop_approval_requests enable row level security;
alter table autoshop_intake_photos enable row level security;
alter table autoshop_intake_sessions enable row level security;

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

revoke all on function check_autoshop_api_rate_limit(
  text, text, integer, integer
) from public, anon, authenticated;
grant execute on function check_autoshop_api_rate_limit(
  text, text, integer, integer
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
  uuid, text, text, text, text, text, uuid, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function create_autoshop_booking(
  uuid, text, text, text, text, text, uuid, text, text, text, text, text, uuid
) to service_role;

revoke all on function transition_autoshop_job(
  uuid, uuid, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function transition_autoshop_job(
  uuid, uuid, text, text, text, text, text, integer
) to service_role;

revoke all on function assign_autoshop_technician(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function assign_autoshop_technician(
  uuid, uuid, uuid
) to service_role;

revoke all on function create_autoshop_approval_request(
  uuid, uuid, uuid, uuid, text, integer, text, text, timestamptz,
  text, text, integer
) from public, anon, authenticated;
grant execute on function create_autoshop_approval_request(
  uuid, uuid, uuid, uuid, text, integer, text, text, timestamptz,
  text, text, integer
) to service_role;

revoke all on function decide_autoshop_approval(uuid, text, text)
  from public, anon, authenticated;
grant execute on function decide_autoshop_approval(uuid, text, text)
  to service_role;

revoke all on function reserve_autoshop_intake_photo(
  uuid, uuid, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function reserve_autoshop_intake_photo(
  uuid, uuid, text, text, text, text, integer
) to service_role;

revoke all on function complete_autoshop_intake_photo(uuid, text)
  from public, anon, authenticated;
grant execute on function complete_autoshop_intake_photo(uuid, text)
  to service_role;
revoke all on function claim_autoshop_intake_photo_deletion(uuid, text)
  from public, anon, authenticated;
grant execute on function claim_autoshop_intake_photo_deletion(uuid, text)
  to service_role;
revoke all on function finalize_autoshop_intake_photo_deletion(uuid, text)
  from public, anon, authenticated;
grant execute on function finalize_autoshop_intake_photo_deletion(uuid, text)
  to service_role;

revoke all on function create_autoshop_booking_with_photos(
  uuid, text, text, text, text, text, uuid, text, text, text,
  text, text, uuid, text
) from public, anon, authenticated;
grant execute on function create_autoshop_booking_with_photos(
  uuid, text, text, text, text, text, uuid, text, text, text,
  text, text, uuid, text
) to service_role;

revoke all on function record_autoshop_intake_session(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function record_autoshop_intake_session(uuid, uuid, boolean)
  to service_role;

revoke all on function create_autoshop_booking_with_photos(
  uuid, text, text, text, text, text, uuid, text, text, text,
  text, text, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function create_autoshop_booking_with_photos(
  uuid, text, text, text, text, text, uuid, text, text, text,
  text, text, uuid, text, uuid
) to service_role;

revoke all on function get_autoshop_dashboard_metrics(uuid, integer)
  from public, anon, authenticated;
grant execute on function get_autoshop_dashboard_metrics(uuid, integer)
  to service_role;

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
