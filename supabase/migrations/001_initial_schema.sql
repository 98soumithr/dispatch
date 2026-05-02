-- Dispatch MVP — initial schema
-- Tables, RLS, helper functions, and the hourly load-expiry cron.
-- Run from the Supabase SQL editor (or `supabase db push` if using the CLI).

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'driver')),
  name text,
  email text,
  phone text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- companies  (one per owner)
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  mc_number text,
  dot_number text,
  base_location text,
  base_lat double precision,
  base_lng double precision,
  min_rate_per_mile numeric not null default 2.0,
  max_deadhead numeric not null default 100,
  preferred_regions text[] not null default '{}',
  equipment text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists companies_owner_id_idx on public.companies(owner_id);

-- ----------------------------------------------------------------------------
-- drivers  (one per driver profile, scoped to a company)
-- ----------------------------------------------------------------------------
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  truck_type text,
  trailer_type text,
  max_weight numeric,
  current_lat double precision,
  current_lng double precision,
  current_location_text text,
  hos_remaining numeric not null default 70,
  status text not null default 'available'
    check (status in ('available', 'busy', 'offline')),
  created_at timestamptz not null default now()
);
create index if not exists drivers_company_id_idx on public.drivers(company_id);
create index if not exists drivers_status_idx on public.drivers(status);

-- ----------------------------------------------------------------------------
-- loads
-- ----------------------------------------------------------------------------
create table if not exists public.loads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  origin text not null,
  origin_lat double precision,
  origin_lng double precision,
  destination text not null,
  destination_lat double precision,
  destination_lng double precision,
  pickup_time timestamptz not null,
  delivery_time timestamptz,
  rate numeric not null,
  miles numeric not null,
  equipment_type text not null,
  broker_name text,
  broker_email text not null,
  status text not null default 'new'
    check (status in ('new', 'assigned', 'in_progress', 'delivered', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists loads_company_id_idx on public.loads(company_id);
create index if not exists loads_status_idx on public.loads(status);
create index if not exists loads_pickup_time_idx on public.loads(pickup_time);

-- ----------------------------------------------------------------------------
-- assignments
-- ----------------------------------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  status text not null default 'assigned'
    check (status in ('assigned', 'en_route', 'picked_up', 'in_transit', 'delivered', 'cancelled')),
  assigned_at timestamptz not null default now(),
  notes text
);
create index if not exists assignments_load_id_idx on public.assignments(load_id);
create index if not exists assignments_driver_id_idx on public.assignments(driver_id);
create index if not exists assignments_status_idx on public.assignments(status);

-- ----------------------------------------------------------------------------
-- invoices
-- ----------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  invoice_number text unique not null,
  amount numeric not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid')),
  pdf_url text,
  created_at timestamptz not null default now()
);
create index if not exists invoices_load_id_idx on public.invoices(load_id);

-- ----------------------------------------------------------------------------
-- location_updates  (history of GPS pings)
-- ----------------------------------------------------------------------------
create table if not exists public.location_updates (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);
create index if not exists location_updates_driver_id_idx on public.location_updates(driver_id);
create index if not exists location_updates_recorded_at_idx on public.location_updates(recorded_at desc);

-- ----------------------------------------------------------------------------
-- push_subscriptions  (web-push targets)
-- ----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

-- ----------------------------------------------------------------------------
-- load_declines  (so the matcher can exclude drivers who already declined)
-- ----------------------------------------------------------------------------
create table if not exists public.load_declines (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  declined_at timestamptz not null default now(),
  unique (load_id, driver_id)
);
create index if not exists load_declines_load_id_idx on public.load_declines(load_id);

-- ----------------------------------------------------------------------------
-- Helper: company_id_for_owner(uuid) — returns the owner's company id (if any)
-- ----------------------------------------------------------------------------
create or replace function public.company_id_for_owner(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.companies where owner_id = p_user_id limit 1;
$$;

-- Helper: company_id_for_driver(uuid) — returns the company id for a driver profile
create or replace function public.company_id_for_driver(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.drivers where user_id = p_user_id limit 1;
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.companies           enable row level security;
alter table public.drivers             enable row level security;
alter table public.loads               enable row level security;
alter table public.assignments         enable row level security;
alter table public.invoices            enable row level security;
alter table public.location_updates    enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.load_declines       enable row level security;

-- profiles: a user can read/update their own row; insert their own row at signup
create policy "profiles_select_self" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id);

-- companies: owner can manage their own company; drivers in the company can read it
create policy "companies_select_owner_or_driver" on public.companies
  for select using (
    auth.uid() = owner_id
    or id = public.company_id_for_driver(auth.uid())
  );
create policy "companies_insert_owner" on public.companies
  for insert with check (auth.uid() = owner_id);
create policy "companies_update_owner" on public.companies
  for update using (auth.uid() = owner_id);
create policy "companies_delete_owner" on public.companies
  for delete using (auth.uid() = owner_id);

-- drivers: a driver sees their own row; the company owner sees all their drivers
create policy "drivers_select_owner_or_self" on public.drivers
  for select using (
    user_id = auth.uid()
    or company_id = public.company_id_for_owner(auth.uid())
  );
create policy "drivers_insert_self" on public.drivers
  for insert with check (user_id = auth.uid());
create policy "drivers_update_self_or_owner" on public.drivers
  for update using (
    user_id = auth.uid()
    or company_id = public.company_id_for_owner(auth.uid())
  );
create policy "drivers_delete_owner" on public.drivers
  for delete using (company_id = public.company_id_for_owner(auth.uid()));

-- loads: owners manage loads in their company; drivers in the company can read them
create policy "loads_select_owner_or_company_driver" on public.loads
  for select using (
    company_id = public.company_id_for_owner(auth.uid())
    or company_id = public.company_id_for_driver(auth.uid())
  );
create policy "loads_insert_owner" on public.loads
  for insert with check (company_id = public.company_id_for_owner(auth.uid()));
create policy "loads_update_owner" on public.loads
  for update using (company_id = public.company_id_for_owner(auth.uid()));
create policy "loads_delete_owner" on public.loads
  for delete using (company_id = public.company_id_for_owner(auth.uid()));

-- assignments: scoped via the load and driver. Owners manage; drivers update their own.
create policy "assignments_select_owner_or_driver" on public.assignments
  for select using (
    exists (
      select 1 from public.loads l
      where l.id = assignments.load_id
        and l.company_id = public.company_id_for_owner(auth.uid())
    )
    or exists (
      select 1 from public.drivers d
      where d.id = assignments.driver_id
        and d.user_id = auth.uid()
    )
  );
create policy "assignments_insert_owner_or_driver" on public.assignments
  for insert with check (
    exists (
      select 1 from public.loads l
      where l.id = load_id
        and l.company_id = public.company_id_for_owner(auth.uid())
    )
    or exists (
      select 1 from public.drivers d
      where d.id = driver_id
        and d.user_id = auth.uid()
    )
  );
create policy "assignments_update_owner_or_driver" on public.assignments
  for update using (
    exists (
      select 1 from public.loads l
      where l.id = assignments.load_id
        and l.company_id = public.company_id_for_owner(auth.uid())
    )
    or exists (
      select 1 from public.drivers d
      where d.id = assignments.driver_id
        and d.user_id = auth.uid()
    )
  );
create policy "assignments_delete_owner" on public.assignments
  for delete using (
    exists (
      select 1 from public.loads l
      where l.id = assignments.load_id
        and l.company_id = public.company_id_for_owner(auth.uid())
    )
  );

-- invoices: company owner only (drivers don't see invoices)
create policy "invoices_select_owner" on public.invoices
  for select using (
    exists (
      select 1 from public.loads l
      where l.id = invoices.load_id
        and l.company_id = public.company_id_for_owner(auth.uid())
    )
  );
create policy "invoices_update_owner" on public.invoices
  for update using (
    exists (
      select 1 from public.loads l
      where l.id = invoices.load_id
        and l.company_id = public.company_id_for_owner(auth.uid())
    )
  );
-- Note: invoices are inserted server-side via the service-role key in /api/invoices/generate;
-- no INSERT policy is needed for the anon/authenticated roles.

-- location_updates: driver writes their own, owner reads their drivers'
create policy "location_updates_insert_self" on public.location_updates
  for insert with check (
    exists (
      select 1 from public.drivers d
      where d.id = driver_id and d.user_id = auth.uid()
    )
  );
create policy "location_updates_select_owner_or_self" on public.location_updates
  for select using (
    exists (
      select 1 from public.drivers d
      where d.id = location_updates.driver_id
        and (
          d.user_id = auth.uid()
          or d.company_id = public.company_id_for_owner(auth.uid())
        )
    )
  );

-- push_subscriptions: each user manages their own subscription rows.
-- Server-side delivery uses the service-role key, which bypasses RLS.
create policy "push_subscriptions_select_self" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "push_subscriptions_insert_self" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy "push_subscriptions_delete_self" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- load_declines: a driver inserts their own decline; owner can read theirs.
create policy "load_declines_insert_self" on public.load_declines
  for insert with check (
    exists (
      select 1 from public.drivers d
      where d.id = driver_id and d.user_id = auth.uid()
    )
  );
create policy "load_declines_select_owner_or_self" on public.load_declines
  for select using (
    exists (
      select 1 from public.drivers d
      where d.id = load_declines.driver_id and d.user_id = auth.uid()
    )
    or exists (
      select 1 from public.loads l
      where l.id = load_declines.load_id
        and l.company_id = public.company_id_for_owner(auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- Realtime  (so the owner dashboard can subscribe)
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.drivers;
alter publication supabase_realtime add table public.assignments;
alter publication supabase_realtime add table public.loads;
alter publication supabase_realtime add table public.location_updates;

-- ----------------------------------------------------------------------------
-- pg_cron — expire stale "new" loads every hour
-- ----------------------------------------------------------------------------
select cron.schedule(
  'expire-stale-loads',
  '0 * * * *',
  $$ update public.loads
       set status = 'expired'
     where status = 'new'
       and pickup_time < (now() - interval '1 hour'); $$
);
