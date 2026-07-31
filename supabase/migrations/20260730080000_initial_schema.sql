begin;

create extension if not exists "pgcrypto";

create table if not exists public.autoshop_services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  price_min integer not null,
  price_max integer not null,
  duration_minutes integer not null
);

create table if not exists public.autoshop_jobs (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  plate_number text not null,
  phone text not null,
  vehicle text not null,
  service_id uuid references public.autoshop_services(id),
  issue_description text,
  probable_issue text,
  urgency text,
  estimate_min integer,
  estimate_max integer,
  status text not null default 'booked',
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.autoshop_status_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.autoshop_jobs(id) on delete cascade,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.autoshop_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.autoshop_jobs(id) on delete cascade,
  kind text not null,
  body text not null,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.autoshop_services enable row level security;
alter table public.autoshop_jobs enable row level security;
alter table public.autoshop_status_history enable row level security;
alter table public.autoshop_messages enable row level security;

create policy "public read autoshop_services"
  on public.autoshop_services for select using (true);
create policy "public read autoshop_jobs"
  on public.autoshop_jobs for select using (true);
create policy "public read autoshop_status_history"
  on public.autoshop_status_history for select using (true);
create policy "public read sent autoshop_messages"
  on public.autoshop_messages for select using (sent = true);

grant select on public.autoshop_services to anon, authenticated;
grant select on public.autoshop_jobs to anon, authenticated;
grant select on public.autoshop_status_history to anon, authenticated;
grant select on public.autoshop_messages to anon, authenticated;
grant all on public.autoshop_services to service_role;
grant all on public.autoshop_jobs to service_role;
grant all on public.autoshop_status_history to service_role;
grant all on public.autoshop_messages to service_role;

commit;

notify pgrst, 'reload schema';
