begin;

set local search_path = auto_repair, public;

do $$
declare
  target_shop_id uuid;
  target_service_id uuid;
  target_job_id uuid;
  created jsonb;
  replayed jsonb;
  decided jsonb;
  expired_result jsonb;
  conflict_result jsonb;
  duplicate_rejected boolean := false;
  capped_rejected boolean := false;
begin
  select id into target_shop_id
    from autoshop_shops where is_active = true limit 1;
  if target_shop_id is null then
    raise exception 'TEST_SETUP_FAILED';
  end if;
  insert into autoshop_services (
    shop_id, name, category, price_min, price_max, duration_minutes
  ) values (
    target_shop_id, 'Phase 11 Test Service', 'Test', 100, 200, 60
  ) returning id into target_service_id;

  insert into autoshop_jobs (
    id, shop_id, customer_name, plate_number, phone, customer_email,
    vehicle, status
  ) values (
    '11000000-0000-4000-8000-000000000001',
    target_shop_id, 'Phase 11 Customer', 'PHASE11', '555-0111',
    'phase11@example.test', 'Phase 11 Vehicle', 'in_progress'
  ) returning id into target_job_id;

  select create_autoshop_approval_request(
    '11000000-0000-4000-8000-000000000011',
    target_shop_id, target_job_id, target_service_id,
    'Additional work found', (
      select price_min from autoshop_services where id = target_service_id
    ),
    'The technician found additional work. Delaying may increase wear.',
    repeat('a', 64), now() + interval '3 days',
    'n8n', 'phase11@example.test', 100
  ) into created;

  if created->'approval'->>'status' <> 'pending'
    or created->'delivery'->>'template_id' <> 'extra_work_approval' then
    raise exception 'CREATE_FAILED';
  end if;

  select create_autoshop_approval_request(
    '11000000-0000-4000-8000-000000000011',
    target_shop_id, target_job_id, target_service_id,
    'Additional work found', (
      select price_min from autoshop_services where id = target_service_id
    ),
    'A retry may draft different prose without changing the operation.',
    repeat('a', 64), now() + interval '3 days',
    'n8n', 'phase11@example.test', 100
  ) into replayed;
  if replayed->>'is_replay' <> 'true'
    or replayed->'delivery'->>'id' <> created->'delivery'->>'id' then
    raise exception 'IDEMPOTENCY_FAILED';
  end if;

  begin
    perform create_autoshop_approval_request(
      '11000000-0000-4000-8000-000000000012',
      target_shop_id, target_job_id, target_service_id,
      'Second pending request', (
        select price_min from autoshop_services where id = target_service_id
      ),
      'Second explanation.', repeat('b', 64), now() + interval '3 days',
      'n8n', 'phase11@example.test', 100
    );
  exception when others then
    if sqlerrm like '%APPROVAL_ALREADY_PENDING%' then
      duplicate_rejected := true;
    else
      raise;
    end if;
  end;
  if not duplicate_rejected then raise exception 'PENDING_UNIQUENESS_FAILED'; end if;

  select decide_autoshop_approval(
    '11000000-0000-4000-8000-000000000011', repeat('a', 64), 'approved'
  ) into decided;
  if decided->>'outcome' <> 'approved' then raise exception 'DECISION_FAILED'; end if;
  if (
    select count(*) from autoshop_status_history
    where action_key = 'approval-decision:11000000-0000-4000-8000-000000000011'
  ) <> 1 then raise exception 'HISTORY_FAILED'; end if;

  select decide_autoshop_approval(
    '11000000-0000-4000-8000-000000000011', repeat('a', 64), 'declined'
  ) into decided;
  if decided->>'outcome' <> 'already_decided' then
    raise exception 'SINGLE_USE_FAILED';
  end if;

  perform create_autoshop_approval_request(
    '11000000-0000-4000-8000-000000000013',
    target_shop_id, target_job_id, target_service_id,
    'Expiring work', (
      select price_min from autoshop_services where id = target_service_id
    ),
    'Expiring explanation.', repeat('c', 64), now() + interval '1 hour',
    'n8n', 'phase11@example.test', 100
  );
  update autoshop_approval_requests
    set expires_at = now() - interval '1 minute'
    where id = '11000000-0000-4000-8000-000000000013';
  select decide_autoshop_approval(
    '11000000-0000-4000-8000-000000000013', repeat('c', 64), 'approved'
  ) into expired_result;
  if expired_result->>'outcome' <> 'expired' then
    raise exception 'EXPIRY_FAILED';
  end if;

  update autoshop_jobs set status = 'waiting_parts' where id = target_job_id;
  perform create_autoshop_approval_request(
    '11000000-0000-4000-8000-000000000014',
    target_shop_id, target_job_id, target_service_id,
    'Concurrent approval', (
      select price_min from autoshop_services where id = target_service_id
    ),
    'Concurrent explanation.', repeat('d', 64), now() + interval '1 hour',
    'n8n', 'phase11@example.test', 100
  );
  update autoshop_jobs set status = 'ready' where id = target_job_id;
  select decide_autoshop_approval(
    '11000000-0000-4000-8000-000000000014', repeat('d', 64), 'approved'
  ) into conflict_result;
  if conflict_result->>'outcome' <> 'conflict'
    or (select status from autoshop_jobs where id = target_job_id) <> 'ready' then
    raise exception 'STALE_DECISION_REGRESSION';
  end if;
  update autoshop_approval_requests
    set status = 'expired', decided_at = now()
    where id = '11000000-0000-4000-8000-000000000014';

  update autoshop_jobs set status = 'in_progress' where id = target_job_id;
  begin
    perform create_autoshop_approval_request(
      '11000000-0000-4000-8000-000000000015',
      target_shop_id, target_job_id, target_service_id,
      'Capped approval', (
        select price_min from autoshop_services where id = target_service_id
      ),
      'Capped explanation.', repeat('e', 64), now() + interval '1 hour',
      'n8n', 'phase11@example.test', 1
    );
  exception when others then
    if sqlerrm like '%APPROVAL_DELIVERY_CAPPED%' then
      capped_rejected := true;
    else
      raise;
    end if;
  end;
  if not capped_rejected
    or exists (
      select 1 from autoshop_approval_requests
      where id = '11000000-0000-4000-8000-000000000015'
    ) then
    raise exception 'CAPPED_APPROVAL_ROLLBACK_FAILED';
  end if;

  if has_table_privilege(
    'anon', 'auto_repair.autoshop_approval_requests', 'select'
  ) then raise exception 'PRIVACY_FAILED'; end if;
  if has_function_privilege(
    'anon', 'auto_repair.decide_autoshop_approval(uuid,text,text)', 'execute'
  ) then raise exception 'RPC_PRIVACY_FAILED'; end if;
end;
$$;

rollback;

select 'PHASE11_DATABASE_BEHAVIOR_OK' as result;
