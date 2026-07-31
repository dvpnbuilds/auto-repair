begin;

set local search_path = auto_repair, public;

alter table autoshop_jobs
  add column if not exists booking_idempotency_key uuid;

create unique index if not exists autoshop_jobs_booking_idempotency_key
  on autoshop_jobs (shop_id, booking_idempotency_key)
  where booking_idempotency_key is not null;

drop index if exists autoshop_one_active_reminder_delivery;
create unique index autoshop_one_active_reminder_delivery
  on autoshop_email_deliveries (job_id, template_id)
  where template_id = 'reminder'
    and status in ('pending', 'sent', 'reconciling');

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

revoke all on function create_autoshop_booking(
  uuid, text, text, text, text, text, uuid, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function create_autoshop_booking(
  uuid, text, text, text, text, text, uuid, text, text, text, text, text, uuid
) to service_role;

notify pgrst, 'reload schema';

commit;
