begin;

set local search_path = auto_repair, public;

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

update autoshop_services
  set shop_id = (select id from autoshop_shops where shop_key = 'ph')
  where shop_id is null;

update autoshop_jobs
  set shop_id = (select id from autoshop_shops where shop_key = 'ph')
  where shop_id is null;

do $$
begin
  if exists (select 1 from autoshop_services where shop_id is null)
    or exists (select 1 from autoshop_jobs where shop_id is null) then
    raise exception 'PHASE6_BACKFILL_INCOMPLETE';
  end if;
end
$$;

alter table autoshop_services
  alter column shop_id set not null;

alter table autoshop_jobs
  alter column shop_id set not null;

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

alter table autoshop_api_attempts enable row level security;
revoke all on autoshop_api_attempts from public, anon, authenticated;
grant select, insert, delete on autoshop_api_attempts to service_role;

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
  if p_bucket not in ('admin-login', 'booking', 'triage')
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

revoke all on function check_autoshop_api_rate_limit(
  text, text, integer, integer
) from public, anon, authenticated;
grant execute on function check_autoshop_api_rate_limit(
  text, text, integer, integer
) to service_role;

commit;

notify pgrst, 'reload schema';
