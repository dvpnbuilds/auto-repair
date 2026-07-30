begin;

create schema if not exists auto_repair;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'autoshop_services',
    'autoshop_jobs',
    'autoshop_status_history',
    'autoshop_messages'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null
      and to_regclass(format('auto_repair.%I', table_name)) is null then
      execute format('alter table public.%I set schema auto_repair', table_name);
    end if;
  end loop;
end
$$;

set local search_path = auto_repair, public;

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

insert into autoshop_shops (
  shop_key,
  name,
  country,
  locale,
  currency,
  timezone,
  language,
  email_sender_name,
  email_sender_address,
  address,
  is_active
)
values (
  'ph',
  'RapidFix Auto Care',
  'PH',
  'en-PH',
  'PHP',
  'Asia/Manila',
  'en',
  'RapidFix Auto Care',
  'service@rapidfix-auto.example',
  'Quezon City, Metro Manila',
  not exists (select 1 from autoshop_shops where is_active = true)
)
on conflict (shop_key) do nothing;

alter table autoshop_services
  add column if not exists shop_id uuid references autoshop_shops(id);

alter table autoshop_jobs
  add column if not exists shop_id uuid references autoshop_shops(id);

update autoshop_services
  set shop_id = (select id from autoshop_shops where shop_key = 'ph')
  where shop_id is null;

update autoshop_jobs
  set shop_id = (select id from autoshop_shops where shop_key = 'ph')
  where shop_id is null;

alter table autoshop_services
  alter column shop_id set not null;

alter table autoshop_jobs
  alter column shop_id set not null;

alter table autoshop_services
  drop constraint if exists autoshop_services_name_key;

create unique index if not exists autoshop_services_shop_name_key
  on autoshop_services (shop_id, name);

alter table autoshop_shops enable row level security;

drop policy if exists "public read autoshop_shops" on autoshop_shops;
create policy "public read autoshop_shops"
  on autoshop_shops
  for select
  using (true);

grant usage on schema auto_repair to anon, authenticated, service_role;
grant all on all tables in schema auto_repair to anon, authenticated, service_role;
grant all on all routines in schema auto_repair to anon, authenticated, service_role;
grant all on all sequences in schema auto_repair to anon, authenticated, service_role;

alter default privileges for role postgres in schema auto_repair
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema auto_repair
  grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema auto_repair
  grant all on sequences to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
