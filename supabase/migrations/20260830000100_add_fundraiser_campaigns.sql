create table if not exists public.fundraiser_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_key text not null,
  campaign_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fundraiser_campaigns_user_campaign_unique unique (user_id, campaign_key)
);

alter table public.fundraiser_campaigns enable row level security;

grant select, insert, update, delete on table public.fundraiser_campaigns to authenticated;
revoke all on table public.fundraiser_campaigns from anon;

drop policy if exists "Users can view their own fundraiser campaigns" on public.fundraiser_campaigns;
drop policy if exists "Users can insert their own fundraiser campaigns" on public.fundraiser_campaigns;
drop policy if exists "Users can update their own fundraiser campaigns" on public.fundraiser_campaigns;
drop policy if exists "Users can delete their own fundraiser campaigns" on public.fundraiser_campaigns;

create policy "Users can view their own fundraiser campaigns"
  on public.fundraiser_campaigns for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own fundraiser campaigns"
  on public.fundraiser_campaigns for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own fundraiser campaigns"
  on public.fundraiser_campaigns for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own fundraiser campaigns"
  on public.fundraiser_campaigns for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists fundraiser_campaigns_user_updated_idx
  on public.fundraiser_campaigns (user_id, updated_at desc);
