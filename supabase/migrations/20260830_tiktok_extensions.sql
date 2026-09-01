-- Genesis OS — TikTok Direct Post extensions (additive migration).
--
-- Builds on supabase/tiktok-direct-post.sql (the base tiktok_posts table).
-- Apply the base first, then this file. Everything is additive and idempotent.
--
-- NOTE: As of this delegation, this migration is WRITTEN but NOT yet applied or
-- verified (the engineer session had no SQL/execute_sql access). A follow-up
-- with SQL access (or a DBA) must apply it and verify, then flip the relevant
-- connection-checklist notes.

-- 1) Add the "rendered" state to tiktok_posts and supporting columns.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tiktok_posts_status_check') then
    alter table public.tiktok_posts drop constraint tiktok_posts_status_check;
  end if;
end $$;

alter table public.tiktok_posts add column if not exists status_history jsonb not null default '[]'::jsonb;
alter table public.tiktok_posts add column if not exists sponsorship_disclosure boolean not null default false;
alter table public.tiktok_posts add column if not exists cover_choice text;

do $$
begin
  alter table public.tiktok_posts add constraint tiktok_posts_status_check check (
    status in (
      'draft','rendered','approved','scheduled','uploading','processing',
      'published','private_only','failed','needs_owner_action'
    )
  );
end $$;

-- 2) Owner-configurable daily scheduling settings (owner-only via RLS).
create table if not exists public.tiktok_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_key text not null default '6000-strangers-one-question',
  daily_time_utc text not null default '16:00',
  daily_auto_publish_enabled boolean not null default false,
  timezone_label text not null default 'UTC',
  updated_at timestamptz not null default now(),
  unique (user_id, campaign_key)
);
alter table public.tiktok_settings enable row level security;
grant select, insert, update, delete on table public.tiktok_settings to authenticated;
revoke all on table public.tiktok_settings from anon;
drop policy if exists "Users can view their own TikTok settings" on public.tiktok_settings;
drop policy if exists "Users can update their own TikTok settings" on public.tiktok_settings;
create policy "Users can view their own TikTok settings"
  on public.tiktok_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can update their own TikTok settings"
  on public.tiktok_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can insert their own TikTok settings"
  on public.tiktok_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- 3) Webhook/publish-status event history (audit trail; owner-only).
create table if not exists public.tiktok_webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  publish_id text,
  tiktok_post_id text,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
alter table public.tiktok_webhook_events enable row level security;
grant select, insert, update, delete on table public.tiktok_webhook_events to authenticated;
revoke all on table public.tiktok_webhook_events from anon;
drop policy if exists "Users can view their own TikTok webhook events" on public.tiktok_webhook_events;
create policy "Users can view their own TikTok webhook events"
  on public.tiktok_webhook_events for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own TikTok webhook events" on public.tiktok_webhook_events;
create policy "Users can insert their own TikTok webhook events"
  on public.tiktok_webhook_events for insert to authenticated
  with check ((select auth.uid()) = user_id);
create index if not exists tiktok_webhook_events_publish_idx
  on public.tiktok_webhook_events (publish_id, received_at desc);

-- 4) Ensure tiktok_posts owner-only RLS (defensive; base file also sets this).
alter table public.tiktok_posts enable row level security;
revoke all on table public.tiktok_posts from anon;
