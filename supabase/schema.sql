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
  created_at timestamptz not null default now()
);

create table if not exists autoshop_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references autoshop_jobs(id) on delete cascade,
  kind text not null,
  body text not null,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

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
    status in ('pending', 'sent', 'failed', 'capped')
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
  if p_status not in ('sent', 'failed') then
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

  if delivery.status in ('sent', 'failed') then
    return to_jsonb(delivery);
  end if;

  if delivery.status <> 'pending' then
    raise exception 'Delivery is not pending';
  end if;

  update autoshop_email_deliveries
    set status = p_status,
        provider_message_id = p_provider_message_id,
        error = p_error,
        sent_at = case when p_status = 'sent' then now() else null end
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

alter table autoshop_shops enable row level security;
alter table autoshop_services enable row level security;
alter table autoshop_jobs enable row level security;
alter table autoshop_status_history enable row level security;
alter table autoshop_messages enable row level security;
alter table autoshop_email_deliveries enable row level security;

drop policy if exists "public read autoshop_shops" on autoshop_shops;
create policy "public read autoshop_shops" on autoshop_shops for select using (true);

drop policy if exists "public read autoshop_services" on autoshop_services;
create policy "public read autoshop_services" on autoshop_services for select using (true);

drop policy if exists "public read autoshop_jobs" on autoshop_jobs;
create policy "public read autoshop_jobs" on autoshop_jobs for select using (true);

drop policy if exists "public read autoshop_status_history" on autoshop_status_history;
create policy "public read autoshop_status_history" on autoshop_status_history for select using (true);

drop policy if exists "public read sent autoshop_messages" on autoshop_messages;
create policy "public read sent autoshop_messages" on autoshop_messages for select using (sent = true);

grant usage on schema auto_repair to anon, authenticated, service_role;
grant all on all tables in schema auto_repair to anon, authenticated, service_role;
grant all on all routines in schema auto_repair to anon, authenticated, service_role;
grant all on all sequences in schema auto_repair to anon, authenticated, service_role;

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

alter default privileges for role postgres in schema auto_repair
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema auto_repair
  grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema auto_repair
  grant all on sequences to anon, authenticated, service_role;

notify pgrst, 'reload schema';
