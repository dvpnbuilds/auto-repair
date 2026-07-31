begin;

set local search_path = auto_repair, public;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'auto-repair-intake-photos',
  'auto-repair-intake-photos',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists autoshop_intake_photos (
  id uuid primary key,
  shop_id uuid not null references autoshop_shops(id) on delete cascade,
  job_id uuid references autoshop_jobs(id) on delete cascade,
  intake_key_hash text not null check (
    intake_key_hash ~ '^[0-9a-f]{64}$'
  ),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique,
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  size_bytes integer not null check (
    size_bytes between 1 and 4194304
  ),
  status text not null default 'uploading' check (
    status in ('uploading', 'ready', 'deleting')
  ),
  created_at timestamptz not null default now(),
  attached_at timestamptz
);

create index if not exists autoshop_intake_photos_session
  on autoshop_intake_photos (shop_id, intake_key_hash, status);
create index if not exists autoshop_intake_photos_job
  on autoshop_intake_photos (job_id)
  where job_id is not null;

create or replace function reserve_autoshop_intake_photo(
  p_photo_id uuid,
  p_shop_id uuid,
  p_intake_key_hash text,
  p_content_hash text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  photo autoshop_intake_photos%rowtype;
  expected_extension text;
begin
  if p_photo_id is null
    or p_intake_key_hash !~ '^[0-9a-f]{64}$'
    or p_content_hash !~ '^[0-9a-f]{64}$'
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_size_bytes < 1
    or p_size_bytes > 4194304 then
    raise exception 'INVALID_INTAKE_PHOTO';
  end if;
  if not exists (
    select 1 from autoshop_shops
    where id = p_shop_id and is_active = true
  ) then
    raise exception 'STALE_SHOP';
  end if;

  expected_extension := case p_mime_type
    when 'image/jpeg' then '.jpg'
    when 'image/png' then '.png'
    when 'image/webp' then '.webp'
  end;
  if p_storage_path <> (
    p_shop_id::text || '/' || p_intake_key_hash || '/' ||
    p_photo_id::text || expected_extension
  ) then
    raise exception 'INVALID_STORAGE_PATH';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'autoshop-intake:' || p_shop_id::text || ':' || p_intake_key_hash,
      0
    )
  );

  select * into photo
    from autoshop_intake_photos
    where id = p_photo_id;
  if found then
    if photo.shop_id <> p_shop_id
      or photo.intake_key_hash <> p_intake_key_hash
      or photo.content_hash <> p_content_hash
      or photo.storage_path <> p_storage_path
      or photo.mime_type <> p_mime_type
      or photo.size_bytes <> p_size_bytes then
      raise exception 'PHOTO_ID_CONFLICT';
    end if;
    return to_jsonb(photo);
  end if;

  if (
    select count(*) from autoshop_intake_photos
    where shop_id = p_shop_id
      and intake_key_hash = p_intake_key_hash
      and job_id is null
  ) >= 3 then
    raise exception 'PHOTO_LIMIT_REACHED';
  end if;

  insert into autoshop_intake_photos (
    id, shop_id, intake_key_hash, content_hash, storage_path, mime_type, size_bytes
  ) values (
    p_photo_id, p_shop_id, p_intake_key_hash, p_content_hash, p_storage_path,
    p_mime_type, p_size_bytes
  )
  returning * into photo;
  return to_jsonb(photo);
end;
$$;

create or replace function complete_autoshop_intake_photo(
  p_photo_id uuid,
  p_intake_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  photo autoshop_intake_photos%rowtype;
begin
  select * into photo
    from autoshop_intake_photos
    where id = p_photo_id and intake_key_hash = p_intake_key_hash;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(
      'autoshop-intake:' || photo.shop_id::text || ':' || p_intake_key_hash,
      0
    )
  );
  update autoshop_intake_photos
    set status = 'ready'
    where id = p_photo_id
      and intake_key_hash = p_intake_key_hash
      and job_id is null
      and status in ('uploading', 'ready')
    returning * into photo;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  return to_jsonb(photo);
end;
$$;

create or replace function claim_autoshop_intake_photo_deletion(
  p_photo_id uuid,
  p_intake_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  photo autoshop_intake_photos%rowtype;
begin
  select * into photo
    from autoshop_intake_photos
    where id = p_photo_id and intake_key_hash = p_intake_key_hash;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'autoshop-intake:' || photo.shop_id::text || ':' || p_intake_key_hash,
      0
    )
  );
  select * into photo
    from autoshop_intake_photos
    where id = p_photo_id and intake_key_hash = p_intake_key_hash
    for update;
  if not found or photo.job_id is not null
    or photo.status not in ('uploading', 'ready', 'deleting') then
    raise exception 'PHOTO_NOT_FOUND';
  end if;
  if photo.status = 'ready' then
    update autoshop_intake_photos
      set status = 'deleting'
      where id = photo.id
      returning * into photo;
  end if;
  return to_jsonb(photo);
end;
$$;

create or replace function finalize_autoshop_intake_photo_deletion(
  p_photo_id uuid,
  p_intake_key_hash text
)
returns boolean
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  photo autoshop_intake_photos%rowtype;
  deleted_count integer;
begin
  select * into photo
    from autoshop_intake_photos
    where id = p_photo_id and intake_key_hash = p_intake_key_hash;
  if not found then return true; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(
      'autoshop-intake:' || photo.shop_id::text || ':' || p_intake_key_hash,
      0
    )
  );
  delete from autoshop_intake_photos
    where id = p_photo_id
      and intake_key_hash = p_intake_key_hash
      and job_id is null
      and status = 'deleting'
    returning * into photo;
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
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
  p_intake_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  created_job jsonb;
  created_job_id uuid;
  ready_count integer;
begin
  created_job := create_autoshop_booking(
    p_shop_id, p_customer_name, p_plate_number, p_phone, p_customer_email,
    p_vehicle, p_service_id, p_issue_description, p_probable_issue, p_urgency,
    p_scheduled_date, p_scheduled_time, p_idempotency_key
  );
  created_job_id := (created_job->>'id')::uuid;

  if p_intake_key_hash is null then return created_job; end if;
  if p_intake_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INTAKE_PHOTOS';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'autoshop-intake:' || p_shop_id::text || ':' || p_intake_key_hash,
      0
    )
  );
  if exists (
    select 1 from autoshop_intake_photos
    where shop_id = p_shop_id
      and intake_key_hash = p_intake_key_hash
      and job_id is not null
      and job_id <> created_job_id
  ) then
    raise exception 'INTAKE_PHOTOS_ALREADY_ATTACHED';
  end if;
  if exists (
    select 1 from autoshop_intake_photos
    where job_id = created_job_id
      and intake_key_hash <> p_intake_key_hash
  ) then
    raise exception 'BOOKING_PHOTO_CONFLICT';
  end if;

  select count(*) into ready_count
    from autoshop_intake_photos
    where shop_id = p_shop_id
      and intake_key_hash = p_intake_key_hash
      and status = 'ready'
      and (job_id is null or job_id = created_job_id);
  if ready_count < 1 or ready_count > 3 then
    raise exception 'INVALID_INTAKE_PHOTOS';
  end if;

  update autoshop_intake_photos
    set job_id = created_job_id,
        attached_at = coalesce(attached_at, now())
    where shop_id = p_shop_id
      and intake_key_hash = p_intake_key_hash
      and status = 'ready'
      and job_id is null;

  if (
    select count(*) from autoshop_intake_photos
    where job_id = created_job_id and status = 'ready'
  ) > 3 then
    raise exception 'PHOTO_LIMIT_REACHED';
  end if;
  return created_job;
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
  if p_bucket not in (
      'admin-login', 'booking', 'triage', 'approval-decision', 'photo-upload'
    )
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

alter table autoshop_intake_photos enable row level security;
revoke all on autoshop_intake_photos from anon, authenticated;
grant all on autoshop_intake_photos to service_role;

revoke all on function reserve_autoshop_intake_photo(
  uuid, uuid, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function reserve_autoshop_intake_photo(
  uuid, uuid, text, text, text, text, integer
) to service_role;

revoke all on function complete_autoshop_intake_photo(uuid, text)
  from public, anon, authenticated;
grant execute on function complete_autoshop_intake_photo(uuid, text)
  to service_role;

revoke all on function claim_autoshop_intake_photo_deletion(uuid, text)
  from public, anon, authenticated;
grant execute on function claim_autoshop_intake_photo_deletion(uuid, text)
  to service_role;

revoke all on function finalize_autoshop_intake_photo_deletion(uuid, text)
  from public, anon, authenticated;
grant execute on function finalize_autoshop_intake_photo_deletion(uuid, text)
  to service_role;

revoke all on function create_autoshop_booking_with_photos(
  uuid, text, text, text, text, text, uuid, text, text, text,
  text, text, uuid, text
) from public, anon, authenticated;
grant execute on function create_autoshop_booking_with_photos(
  uuid, text, text, text, text, text, uuid, text, text, text,
  text, text, uuid, text
) to service_role;

notify pgrst, 'reload schema';

commit;
