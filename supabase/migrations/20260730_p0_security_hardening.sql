begin;

set local search_path = auto_repair, public;

drop policy if exists "public read autoshop_jobs" on autoshop_jobs;
drop policy if exists "public read autoshop_status_history" on autoshop_status_history;
drop policy if exists "public read sent autoshop_messages" on autoshop_messages;

revoke all on autoshop_jobs from anon, authenticated;
revoke all on autoshop_status_history from anon, authenticated;
revoke all on autoshop_messages from anon, authenticated;
revoke all on autoshop_email_deliveries from anon, authenticated;

create table if not exists autoshop_tracker_attempts (
  id uuid primary key default gen_random_uuid(),
  rate_key text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists autoshop_tracker_attempts_rate_window
  on autoshop_tracker_attempts (rate_key, attempted_at);

alter table autoshop_tracker_attempts enable row level security;
revoke all on autoshop_tracker_attempts from anon, authenticated;
grant all on autoshop_tracker_attempts to service_role;

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

alter default privileges for role postgres in schema auto_repair
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema auto_repair
  revoke all on routines from anon, authenticated;
alter default privileges for role postgres in schema auto_repair
  revoke all on sequences from anon, authenticated;

commit;

notify pgrst, 'reload schema';
