begin;

set local search_path = auto_repair, public;

do $$
declare
  target_shop_id uuid;
  other_shop_id uuid;
  first_technician_id uuid;
  second_technician_id uuid;
  cross_shop_technician_id uuid;
  target_job_id uuid;
  rejected_cross_shop boolean := false;
begin
  select id
    into target_shop_id
    from autoshop_shops
    where is_active = true
    limit 1;

  if target_shop_id is null then
    raise exception 'TEST_SETUP_FAILED: active shop missing';
  end if;

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
    tagline,
    phone,
    hours,
    is_active
  )
  values (
    'phase10-test-shop',
    'Phase 10 Test Shop',
    'US',
    'en-US',
    'USD',
    'UTC',
    'en',
    'Phase 10 Test Shop',
    'test@example.test',
    'Test address',
    'Test shop tagline',
    '555-0100',
    'Mon–Fri, 8:00 AM–5:00 PM',
    false
  )
  returning id into other_shop_id;

  insert into autoshop_technicians (shop_id, name)
  values (target_shop_id, 'Phase 10 Technician One')
  returning id into first_technician_id;

  insert into autoshop_technicians (shop_id, name)
  values (target_shop_id, 'Phase 10 Technician Two')
  returning id into second_technician_id;

  insert into autoshop_technicians (shop_id, name)
  values (other_shop_id, 'Cross Shop Technician')
  returning id into cross_shop_technician_id;

  insert into autoshop_jobs (
    shop_id,
    customer_name,
    plate_number,
    phone,
    customer_email,
    vehicle,
    status
  )
  values (
    target_shop_id,
    'Phase 10 Customer',
    'PHASE10',
    '555-0110',
    'phase10@example.test',
    'Phase 10 Vehicle',
    'booked'
  )
  returning id into target_job_id;

  perform assign_autoshop_technician(
    target_job_id,
    target_shop_id,
    first_technician_id
  );

  if (
    select technician_id
      from autoshop_jobs
      where id = target_job_id
  ) is distinct from first_technician_id then
    raise exception 'ASSIGNMENT_FAILED: initial assignment was not saved';
  end if;

  perform assign_autoshop_technician(
    target_job_id,
    target_shop_id,
    second_technician_id
  );

  if (
    select technician_id
      from autoshop_jobs
      where id = target_job_id
  ) is distinct from second_technician_id then
    raise exception 'ASSIGNMENT_FAILED: reassignment was not saved';
  end if;

  begin
    perform assign_autoshop_technician(
      target_job_id,
      target_shop_id,
      cross_shop_technician_id
    );
  exception
    when others then
      if sqlerrm like '%TECHNICIAN_NOT_FOUND%' then
        rejected_cross_shop := true;
      else
        raise;
      end if;
  end;

  if not rejected_cross_shop then
    raise exception 'SHOP_SCOPE_FAILED: cross-shop assignment was accepted';
  end if;

  perform assign_autoshop_technician(
    target_job_id,
    target_shop_id,
    null
  );

  if (
    select technician_id
      from autoshop_jobs
      where id = target_job_id
  ) is not null then
    raise exception 'UNASSIGNMENT_FAILED: technician was not cleared';
  end if;

  if has_table_privilege(
    'anon',
    'auto_repair.autoshop_technicians',
    'select'
  ) then
    raise exception 'PRIVACY_FAILED: anon can read technicians';
  end if;

  if has_function_privilege(
    'anon',
    'auto_repair.assign_autoshop_technician(uuid,uuid,uuid)',
    'execute'
  ) then
    raise exception 'PRIVACY_FAILED: anon can assign technicians';
  end if;
end;
$$;

rollback;

select 'PHASE10_DATABASE_BEHAVIOR_OK' as result;
