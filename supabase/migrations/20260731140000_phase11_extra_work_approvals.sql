begin;

set local search_path = auto_repair, public;

alter table autoshop_email_deliveries
  drop constraint if exists autoshop_email_deliveries_template_id_check;
alter table autoshop_email_deliveries
  add constraint autoshop_email_deliveries_template_id_check check (
    template_id in (
      'status_update',
      'completion_report',
      'reminder',
      'review_request',
      'extra_work_approval'
    )
  );

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
    from autoshop_approval_requests
    where id = p_request_id;

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
      'is_replay', true,
      'approval', to_jsonb(approval),
      'message', to_jsonb(approval_message),
      'delivery', to_jsonb(delivery)
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
    where job_id = p_job_id
      and status = 'pending'
      and expires_at <= now();

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
      p_job_id,
      'extra_work_approval',
      trim(p_customer_explanation),
      false,
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
    null::autoshop_email_deliveries,
    reservation->'delivery'
  );
  if delivery.status = 'capped' then
    raise exception 'APPROVAL_DELIVERY_CAPPED';
  end if;

  return jsonb_build_object(
    'is_replay', false,
    'approval', to_jsonb(approval),
    'message', to_jsonb(approval_message),
    'delivery', to_jsonb(delivery)
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
  if not found then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  if approval.status <> 'pending' then
    return jsonb_build_object(
      'outcome', 'already_decided',
      'approval', to_jsonb(approval)
    );
  end if;
  if approval.expires_at <= now() then
    update autoshop_approval_requests
      set status = 'expired', decided_at = now()
      where id = approval.id
      returning * into approval;
    return jsonb_build_object('outcome', 'expired', 'approval', to_jsonb(approval));
  end if;

  select * into target_job
    from autoshop_jobs
    where id = approval.job_id and shop_id = approval.shop_id
    for update;
  if not found then
    return jsonb_build_object('outcome', 'invalid');
  end if;
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
      target_job.id,
      'in_progress',
      case p_decision
        when 'approved' then 'Customer approved extra work'
        else 'Customer declined extra work'
      end,
      'approval-decision:' || approval.id::text
    );

  return jsonb_build_object(
    'outcome', p_decision,
    'approval', to_jsonb(approval),
    'job', to_jsonb(target_job)
  );
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
  if p_bucket not in ('admin-login', 'booking', 'triage', 'approval-decision')
    or p_rate_key !~ '^[0-9a-f]{64}$'
    or p_limit < 1 or p_limit > 100
    or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'INVALID_RATE_LIMIT_ARGUMENTS';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_bucket || ':' || p_rate_key, 0)
  );
  delete from autoshop_api_attempts
    where attempted_at < now() - interval '24 hours';
  select count(*) into recent_attempts
    from autoshop_api_attempts
    where bucket = p_bucket
      and rate_key = p_rate_key
      and attempted_at >= now() - make_interval(secs => p_window_seconds);
  if recent_attempts >= p_limit then return false; end if;
  insert into autoshop_api_attempts (bucket, rate_key)
    values (p_bucket, p_rate_key);
  return true;
end;
$$;

alter table autoshop_approval_requests enable row level security;
revoke all on autoshop_approval_requests from anon, authenticated;
grant all on autoshop_approval_requests to service_role;

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

notify pgrst, 'reload schema';

commit;
