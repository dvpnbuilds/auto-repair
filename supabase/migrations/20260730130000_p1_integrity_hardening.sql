begin;

set local search_path = auto_repair, public;

alter table autoshop_status_history
  add column if not exists action_key text;
create unique index if not exists autoshop_status_history_action_key
  on autoshop_status_history (action_key)
  where action_key is not null;

alter table autoshop_messages
  add column if not exists action_key text;
create unique index if not exists autoshop_messages_action_key
  on autoshop_messages (action_key)
  where action_key is not null;

alter table autoshop_email_deliveries
  drop constraint if exists autoshop_email_deliveries_status_check;
alter table autoshop_email_deliveries
  add constraint autoshop_email_deliveries_status_check check (
    status in ('pending', 'sent', 'failed', 'capped', 'reconciling')
  );

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

commit;

notify pgrst, 'reload schema';
