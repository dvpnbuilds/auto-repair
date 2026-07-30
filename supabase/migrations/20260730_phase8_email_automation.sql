begin;

set local search_path = auto_repair, public;

alter table autoshop_jobs
  add column if not exists customer_email text;

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

alter table autoshop_email_deliveries enable row level security;

grant all on autoshop_email_deliveries to anon, authenticated, service_role;

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

commit;

notify pgrst, 'reload schema';
