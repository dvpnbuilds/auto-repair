begin;

set local search_path = auto_repair, public;

do $$
declare
  shop_id uuid;
  service_id uuid;
  technician_id uuid;
  intake_id uuid := '13000000-0000-4000-8000-000000000001';
  unbooked_intake_id uuid := '13000000-0000-4000-8000-000000000002';
  booking_time timestamp;
  booking_date text;
  booking_clock text;
  created_job jsonb;
  job_id uuid;
  metrics jsonb;
begin
  insert into autoshop_shops (
    shop_key, name, country, locale, currency, timezone, language,
    email_sender_name, email_sender_address, address, tagline, phone, hours,
    is_active
  ) values (
    'phase13-test', 'Phase 13 Shop', 'US', 'en-US', 'USD', 'UTC', 'en',
    'Phase 13 Shop', 'phase13@example.test', 'Test address',
    'Test shop tagline', '555-0130', 'Mon–Fri, 8:00 AM–5:00 PM', false
  ) returning id into shop_id;
  perform set_active_autoshop('phase13-test');

  insert into autoshop_services (
    shop_id, name, category, price_min, price_max, duration_minutes
  ) values (
    shop_id, 'Dashboard Test Service', 'Test', 100, 300, 60
  ) returning id into service_id;
  insert into autoshop_technicians (shop_id, name)
    values (shop_id, 'Dashboard Technician')
    returning id into technician_id;

  perform record_autoshop_intake_session(intake_id, shop_id, false);
  perform record_autoshop_intake_session(intake_id, shop_id, true);
  perform record_autoshop_intake_session(intake_id, shop_id, true);
  perform record_autoshop_intake_session(unbooked_intake_id, shop_id, true);

  booking_time := now() at time zone 'UTC' + interval '2 days';
  booking_date := to_char(booking_time, 'YYYY-MM-DD');
  booking_clock := to_char(booking_time, 'HH24:MI');
  select create_autoshop_booking_with_photos(
    shop_id,
    'Dashboard Customer',
    'PHASE13',
    '555-0130',
    'phase13-customer@example.test',
    'Dashboard Vehicle',
    service_id,
    'Dashboard issue',
    'Dashboard probable issue',
    'medium',
    booking_date,
    booking_clock,
    '13000000-0000-4000-8000-000000000099',
    null,
    intake_id
  ) into created_job;
  job_id := (created_job->>'id')::uuid;
  perform assign_autoshop_technician(job_id, shop_id, technician_id);

  insert into autoshop_approval_requests (
    id, shop_id, job_id, description, line_items, amount,
    customer_explanation, status, token_hash, expires_at, decided_at
  ) values
  (
    '13000000-0000-4000-8000-000000000011',
    shop_id, job_id, 'Approved work', '[{"name":"Part","amount":50}]',
    50, 'Approved explanation', 'approved', repeat('a', 64),
    now() + interval '1 day', now()
  ),
  (
    '13000000-0000-4000-8000-000000000012',
    shop_id, job_id, 'Declined work', '[{"name":"Part","amount":40}]',
    40, 'Declined explanation', 'declined', repeat('b', 64),
    now() + interval '1 day', now()
  );

  insert into autoshop_email_deliveries (
    shop_id, job_id, template_id, transport, recipient, status, sent_at
  ) values (
    shop_id, job_id, 'reminder', 'resend', 'phase13@example.test', 'sent', now()
  );

  select get_autoshop_dashboard_metrics(shop_id, 30) into metrics;
  if (metrics->>'jobs_total')::integer <> 1 then
    raise exception 'DASHBOARD_JOB_TOTAL_FAILED';
  end if;
  if (metrics->'jobs_by_status'->>'booked')::integer <> 1 then
    raise exception 'DASHBOARD_STATUS_FAILED';
  end if;
  if (metrics->'estimated_booked_value'->>'minimum')::integer <> 100
    or (metrics->'estimated_booked_value'->>'maximum')::integer <> 300 then
    raise exception 'DASHBOARD_ESTIMATE_FAILED';
  end if;
  if (metrics->'intake_conversion'->>'completed')::integer <> 2
    or (metrics->'intake_conversion'->>'booked')::integer <> 1
    or (metrics->'intake_conversion'->>'rate')::numeric <> 50 then
    raise exception 'DASHBOARD_CONVERSION_FAILED';
  end if;
  if (metrics->'approval_acceptance'->>'decided')::integer <> 2
    or (metrics->'approval_acceptance'->>'approved')::integer <> 1
    or (metrics->'approval_acceptance'->>'rate')::numeric <> 50 then
    raise exception 'DASHBOARD_APPROVAL_FAILED';
  end if;
  if (metrics->>'reminders_sent')::integer <> 1 then
    raise exception 'DASHBOARD_REMINDER_FAILED';
  end if;
  if (metrics->'technician_workload'->0->>'active_jobs')::integer <> 1 then
    raise exception 'DASHBOARD_WORKLOAD_FAILED';
  end if;
  if has_table_privilege(
    'anon', 'auto_repair.autoshop_intake_sessions', 'select'
  ) then raise exception 'INTAKE_SESSION_PRIVACY_FAILED'; end if;
  if has_function_privilege(
    'anon',
    'auto_repair.get_autoshop_dashboard_metrics(uuid,integer)',
    'execute'
  ) then raise exception 'DASHBOARD_RPC_PRIVACY_FAILED'; end if;
end;
$$;

rollback;

select 'PHASE13_DATABASE_BEHAVIOR_OK' as result;
