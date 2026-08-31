-- Genesis Farm Operations foundation
-- Apply in Supabase SQL Editor. Additive and idempotent.

create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  business_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null,
  field_number text,
  ownership_type text not null default 'owned'
    check (ownership_type in ('owned','cash_rent','crop_share','flex_lease','custom_farmed','grazing_lease','other')),
  stated_acres numeric(12,3),
  calculated_acres numeric(12,3),
  rent_per_acre numeric(12,2),
  lease_start date,
  lease_end date,
  landlord_name text,
  production_program text not null default 'conventional'
    check (production_program in ('conventional','certified_organic','transitional_organic','organic_practices','regenerative','non_gmo','identity_preserved','other')),
  certifier_name text,
  organic_eligibility_date date,
  boundary geometry(MultiPolygon, 4326),
  center_point geometry(Point, 4326),
  legal_description text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, name)
);

create table if not exists public.field_seasons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade,
  crop_year integer not null check (crop_year between 1900 and 2200),
  crop_name text,
  variety text,
  intended_use text default 'commercial',
  production_program text,
  planted_acres numeric(12,3),
  planting_date date,
  harvest_date date,
  total_harvest_lbs numeric(16,3),
  pounds_per_acre numeric(14,3),
  bushels_per_acre numeric(14,3),
  gross_revenue numeric(16,2),
  total_cost numeric(16,2),
  cost_per_acre numeric(14,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(field_id, crop_year)
);

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  farm_id uuid references public.farms(id) on delete cascade,
  name text not null,
  category text not null default 'custom',
  value_type text not null check (value_type in ('text','number','currency','date','boolean','rating','quantity')),
  unit text,
  applies_to text not null default 'field' check (applies_to in ('farm','field','season','operation','application','harvest','equipment')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  value jsonb not null default '{}'::jsonb,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(definition_id, entity_type, entity_id)
);

create index if not exists farms_user_idx on public.farms(user_id);
create index if not exists fields_user_farm_idx on public.fields(user_id, farm_id);
create index if not exists fields_boundary_gix on public.fields using gist(boundary);
create index if not exists field_seasons_user_field_idx on public.field_seasons(user_id, field_id, crop_year desc);
create index if not exists custom_defs_user_idx on public.custom_field_definitions(user_id);
create index if not exists custom_values_entity_idx on public.custom_field_values(user_id, entity_type, entity_id);

alter table public.farms enable row level security;
alter table public.fields enable row level security;
alter table public.field_seasons enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_values enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['farms','fields','field_seasons','custom_field_definitions','custom_field_values']
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', table_name || '_delete_own', table_name);
  end loop;
end $$;
