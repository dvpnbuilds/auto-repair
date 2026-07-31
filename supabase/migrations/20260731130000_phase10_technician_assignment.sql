begin;

set local search_path = auto_repair, public;

create table if not exists autoshop_technicians (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references autoshop_shops(id) on delete cascade,
  name text not null check (
    char_length(trim(name)) between 1 and 100
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shop_id, name)
);

create unique index if not exists autoshop_technicians_id_shop_key
  on autoshop_technicians (id, shop_id);

alter table autoshop_jobs
  add column if not exists technician_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
      where conname = 'autoshop_jobs_technician_shop_fk'
        and conrelid = 'autoshop_jobs'::regclass
  ) then
    alter table autoshop_jobs
      add constraint autoshop_jobs_technician_shop_fk
      foreign key (technician_id, shop_id)
      references autoshop_technicians (id, shop_id);
  end if;
end;
$$;

create index if not exists autoshop_jobs_technician_lookup
  on autoshop_jobs (shop_id, technician_id, status);

create or replace function assign_autoshop_technician(
  p_job_id uuid,
  p_shop_id uuid,
  p_technician_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  target_job autoshop_jobs%rowtype;
begin
  select *
    into target_job
    from autoshop_jobs
    where id = p_job_id
      and shop_id = p_shop_id
    for update;

  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if p_technician_id is not null and not exists (
    select 1
      from autoshop_technicians
      where id = p_technician_id
        and shop_id = p_shop_id
        and is_active = true
  ) then
    raise exception 'TECHNICIAN_NOT_FOUND';
  end if;

  update autoshop_jobs
    set technician_id = p_technician_id
    where id = target_job.id
    returning * into target_job;

  return to_jsonb(target_job);
end;
$$;

alter table autoshop_technicians enable row level security;

revoke all on autoshop_technicians from anon, authenticated;
grant all on autoshop_technicians to service_role;

revoke all on function assign_autoshop_technician(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function assign_autoshop_technician(uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
