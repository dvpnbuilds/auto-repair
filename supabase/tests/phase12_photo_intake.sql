begin;

set local search_path = auto_repair, public;

do $$
declare
  target_shop_id uuid;
  target_service_id uuid;
  created_job jsonb;
  photo_index integer;
  photo_id uuid;
  limit_rejected boolean := false;
  local_booking timestamptz;
  local_date text;
  local_time text;
  deletion_claim jsonb;
  deletion_blocked boolean := false;
  deletion_finalized boolean;
begin
  select id into target_shop_id
    from autoshop_shops where is_active = true limit 1;
  if target_shop_id is null then raise exception 'TEST_SETUP_FAILED'; end if;
  insert into autoshop_services (
    shop_id, name, category, price_min, price_max, duration_minutes
  ) values (
    target_shop_id, 'Phase 12 Test Service', 'Test', 100, 200, 60
  ) returning id into target_service_id;

  for photo_index in 1..3 loop
    photo_id := (
      '12000000-0000-4000-8000-' ||
      lpad(photo_index::text, 12, '0')
    )::uuid;
    perform reserve_autoshop_intake_photo(
      photo_id,
      target_shop_id,
      repeat('a', 64),
      repeat(photo_index::text, 64),
      target_shop_id::text || '/' || repeat('a', 64) || '/' ||
        photo_id::text || '.png',
      'image/png',
      1024
    );
    perform complete_autoshop_intake_photo(photo_id, repeat('a', 64));
  end loop;

  begin
    photo_id := '12000000-0000-4000-8000-000000000004';
    perform reserve_autoshop_intake_photo(
      photo_id, target_shop_id, repeat('a', 64), repeat('4', 64),
      target_shop_id::text || '/' || repeat('a', 64) || '/' ||
        photo_id::text || '.png',
      'image/png', 1024
    );
  exception when others then
    if sqlerrm like '%PHOTO_LIMIT_REACHED%' then
      limit_rejected := true;
    else
      raise;
    end if;
  end;
  if not limit_rejected then raise exception 'PHOTO_LIMIT_FAILED'; end if;

  select (now() + interval '2 days') at time zone timezone
    into local_booking
    from autoshop_shops where id = target_shop_id;
  local_date := to_char(local_booking, 'YYYY-MM-DD');
  local_time := to_char(local_booking, 'HH24:MI');

  select create_autoshop_booking_with_photos(
    target_shop_id,
    'Phase 12 Customer',
    'PHASE12',
    '555-0120',
    'phase12@example.test',
    'Phase 12 Vehicle',
    target_service_id,
    'Visible dashboard warning',
    'Warning indicator',
    'medium',
    local_date,
    local_time,
    '12000000-0000-4000-8000-000000000099',
    repeat('a', 64)
  ) into created_job;

  if (
    select count(*) from autoshop_intake_photos
    where job_id = (created_job->>'id')::uuid
      and status = 'ready'
      and attached_at is not null
  ) <> 3 then
    raise exception 'PHOTO_ATTACHMENT_FAILED';
  end if;

  if (
    select create_autoshop_booking_with_photos(
      target_shop_id,
      'Phase 12 Customer',
      'PHASE12',
      '555-0120',
      'phase12@example.test',
      'Phase 12 Vehicle',
      target_service_id,
      'Visible dashboard warning',
      'Warning indicator',
      'medium',
      local_date,
      local_time,
      '12000000-0000-4000-8000-000000000099',
      repeat('a', 64)
    )
  )->>'id' <> created_job->>'id' then
    raise exception 'BOOKING_REPLAY_FAILED';
  end if;

  photo_id := '12000000-0000-4000-8000-000000000020';
  perform reserve_autoshop_intake_photo(
    photo_id, target_shop_id, repeat('b', 64), repeat('5', 64),
    target_shop_id::text || '/' || repeat('b', 64) || '/' ||
      photo_id::text || '.png',
    'image/png', 1024
  );
  perform complete_autoshop_intake_photo(photo_id, repeat('b', 64));
  select claim_autoshop_intake_photo_deletion(
    photo_id, repeat('b', 64)
  ) into deletion_claim;
  if deletion_claim->>'status' <> 'deleting' then
    raise exception 'PHOTO_DELETE_CLAIM_FAILED';
  end if;
  local_date := to_char(local_date::date + 1, 'YYYY-MM-DD');
  begin
    perform create_autoshop_booking_with_photos(
      target_shop_id,
      'Phase 12 Delete Race',
      'PHASE12RACE',
      '555-0121',
      'phase12race@example.test',
      'Phase 12 Vehicle',
      target_service_id,
      'Photo delete race',
      'Warning indicator',
      'medium',
      local_date,
      local_time,
      '12000000-0000-4000-8000-000000000098',
      repeat('b', 64)
    );
  exception when others then
    if sqlerrm like '%INVALID_INTAKE_PHOTOS%' then
      deletion_blocked := true;
    else
      raise;
    end if;
  end;
  if not deletion_blocked then
    raise exception 'PHOTO_DELETE_BOOKING_RACE_FAILED';
  end if;
  select finalize_autoshop_intake_photo_deletion(
    photo_id, repeat('b', 64)
  ) into deletion_finalized;
  if deletion_finalized is distinct from true or exists (
    select 1 from autoshop_intake_photos where id = photo_id
  ) then
    raise exception 'PHOTO_DELETE_FINALIZE_FAILED';
  end if;

  photo_id := '12000000-0000-4000-8000-000000000030';
  perform reserve_autoshop_intake_photo(
    photo_id, target_shop_id, repeat('c', 64), repeat('6', 64),
    target_shop_id::text || '/' || repeat('c', 64) || '/' ||
      photo_id::text || '.png',
    'image/png', 1024
  );
  update autoshop_intake_photos
    set created_at = now() - interval '20 minutes'
    where id = photo_id;
  perform reserve_autoshop_intake_photo(
    '12000000-0000-4000-8000-000000000031',
    target_shop_id, repeat('d', 64), repeat('7', 64),
    target_shop_id::text || '/' || repeat('d', 64) || '/' ||
      '12000000-0000-4000-8000-000000000031.png',
    'image/png', 1024
  );
  if not exists (
    select 1 from autoshop_intake_photos
    where id = '12000000-0000-4000-8000-000000000030'
      and status = 'uploading'
  ) then
    raise exception 'ABANDONED_PHOTO_METADATA_LOST';
  end if;

  if (
    select public from storage.buckets
    where id = 'auto-repair-intake-photos'
  ) is distinct from false then
    raise exception 'PRIVATE_BUCKET_FAILED';
  end if;
  if has_table_privilege(
    'anon', 'auto_repair.autoshop_intake_photos', 'select'
  ) then raise exception 'PHOTO_PRIVACY_FAILED'; end if;
  if has_function_privilege(
    'anon',
    'auto_repair.reserve_autoshop_intake_photo(uuid,uuid,text,text,text,text,integer)',
    'execute'
  ) then raise exception 'PHOTO_RPC_PRIVACY_FAILED'; end if;
end;
$$;

rollback;

select 'PHASE12_DATABASE_BEHAVIOR_OK' as result;
