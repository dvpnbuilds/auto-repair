begin;

set local search_path = auto_repair, public;

do $$
declare
  target_shop_id uuid;
  target_service_id uuid;
  first_booking jsonb;
  replay_booking jsonb;
  first_job_id uuid;
  first_message_id uuid;
  second_message_id uuid;
begin
  select id
    into target_shop_id
    from autoshop_shops
    where is_active = true
    limit 1;

  if target_shop_id is null then
    raise exception 'TEST_SETUP_FAILED: active shop missing';
  end if;

  insert into autoshop_services (
    shop_id,
    name,
    category,
    price_min,
    price_max,
    duration_minutes
  )
  values (
    target_shop_id,
    'Clean DB Safety Test',
    'Test',
    100,
    200,
    120
  )
  returning id into target_service_id;

  first_booking := create_autoshop_booking(
    target_shop_id,
    'Test Customer',
    'SAFE-001',
    '555-0100',
    'test@example.test',
    'Test Vehicle',
    target_service_id,
    'Clean database verification',
    null,
    null,
    '2099-01-02',
    '09:00',
    '00000000-0000-4000-8000-000000000101'
  );

  replay_booking := create_autoshop_booking(
    target_shop_id,
    'Changed Retry Payload',
    'SAFE-RETRY',
    '555-0101',
    'retry@example.test',
    'Different Vehicle',
    target_service_id,
    null,
    null,
    null,
    '2099-01-02',
    '11:00',
    '00000000-0000-4000-8000-000000000101'
  );

  if first_booking->>'id' is distinct from replay_booking->>'id' then
    raise exception 'IDEMPOTENCY_FAILED: retry created a different job';
  end if;

  if (
    select count(*)
      from autoshop_jobs
      where booking_idempotency_key =
        '00000000-0000-4000-8000-000000000101'
  ) <> 1 then
    raise exception 'IDEMPOTENCY_FAILED: expected exactly one job';
  end if;

  begin
    perform create_autoshop_booking(
      target_shop_id,
      'Overlap Customer',
      'SAFE-002',
      '555-0102',
      'overlap@example.test',
      'Overlap Vehicle',
      target_service_id,
      null,
      null,
      null,
      '2099-01-02',
      '10:00',
      '00000000-0000-4000-8000-000000000102'
    );
    raise exception 'CAPACITY_FAILED: overlapping booking was accepted';
  exception
    when others then
      if sqlerrm not like '%SLOT_UNAVAILABLE%' then
        raise;
      end if;
  end;

  first_job_id := (first_booking->>'id')::uuid;

  insert into autoshop_messages (job_id, kind, body, sent)
  values (first_job_id, 'reminder', 'First reminder', false)
  returning id into first_message_id;

  insert into autoshop_email_deliveries (
    shop_id,
    job_id,
    message_id,
    template_id,
    transport,
    recipient,
    status
  )
  values (
    target_shop_id,
    first_job_id,
    first_message_id,
    'reminder',
    'n8n',
    'test@example.test',
    'reconciling'
  );

  insert into autoshop_messages (job_id, kind, body, sent)
  values (first_job_id, 'reminder', 'Second reminder', false)
  returning id into second_message_id;

  begin
    insert into autoshop_email_deliveries (
      shop_id,
      job_id,
      message_id,
      template_id,
      transport,
      recipient,
      status
    )
    values (
      target_shop_id,
      first_job_id,
      second_message_id,
      'reminder',
      'n8n',
      'test@example.test',
      'pending'
    );
    raise exception 'REMINDER_IDEMPOTENCY_FAILED: second delivery was accepted';
  exception
    when unique_violation then
      null;
  end;

  if (
    select count(*)
      from autoshop_email_deliveries
      where job_id = first_job_id
        and template_id = 'reminder'
  ) <> 1 then
    raise exception 'REMINDER_IDEMPOTENCY_FAILED: expected one delivery';
  end if;
end;
$$;

rollback;

select 'DATABASE_BEHAVIOR_OK' as result;
