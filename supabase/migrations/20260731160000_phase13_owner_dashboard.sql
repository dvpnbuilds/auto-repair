begin;

set local search_path = auto_repair, public;

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

alter table autoshop_intake_sessions enable row level security;
revoke all on autoshop_intake_sessions from anon, authenticated;
grant all on autoshop_intake_sessions to service_role;

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

notify pgrst, 'reload schema';

commit;
