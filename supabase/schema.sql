-- AutoShop Assistant schema (autoshop_ prefix avoids collision with other apps in this Supabase project)
create extension if not exists "pgcrypto";

create table if not exists autoshop_services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  price_min integer not null,
  price_max integer not null,
  duration_minutes integer not null
);

create table if not exists autoshop_jobs (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  plate_number text not null,
  phone text not null,
  vehicle text not null,
  service_id uuid references autoshop_services(id),
  issue_description text,
  probable_issue text,
  urgency text,
  estimate_min integer,
  estimate_max integer,
  status text not null default 'booked',
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists autoshop_status_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references autoshop_jobs(id) on delete cascade,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists autoshop_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references autoshop_jobs(id) on delete cascade,
  kind text not null,
  body text not null,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table autoshop_services enable row level security;
alter table autoshop_jobs enable row level security;
alter table autoshop_status_history enable row level security;
alter table autoshop_messages enable row level security;

drop policy if exists "public read autoshop_services" on autoshop_services;
create policy "public read autoshop_services" on autoshop_services for select using (true);

drop policy if exists "public read autoshop_jobs" on autoshop_jobs;
create policy "public read autoshop_jobs" on autoshop_jobs for select using (true);

drop policy if exists "public read autoshop_status_history" on autoshop_status_history;
create policy "public read autoshop_status_history" on autoshop_status_history for select using (true);
