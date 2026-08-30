-- Genesis OS TikTok Direct Post storage.
-- Idempotent live schema script. Apply through Supabase SQL/MCP, then verify RLS.

create table if not exists public.tiktok_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_key text not null default '6000-strangers-one-question',
  title text not null,
  caption text not null,
  media_url text not null,
  cover_url text,
  scheduled_for timestamptz,
  privacy_level text not null default 'SELF_ONLY'
    check (privacy_level in ('PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY')),
  disable_comment boolean not null default false,
  disable_duet boolean not null default false,
  disable_stitch boolean not null default false,
  owner_approved boolean not null default false,
  approved_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'scheduled', 'uploading', 'processing', 'published', 'private_only', 'failed', 'needs_owner_action')),
  publish_id text,
  tiktok_post_id text,
  tiktok_post_url text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tiktok_posts enable row level security;

grant select, insert, update, delete on table public.tiktok_posts to authenticated;
revoke all on table public.tiktok_posts from anon;

drop policy if exists "Users can view their own TikTok posts" on public.tiktok_posts;
drop policy if exists "Users can insert their own TikTok posts" on public.tiktok_posts;
drop policy if exists "Users can update their own TikTok posts" on public.tiktok_posts;
drop policy if exists "Users can delete their own TikTok posts" on public.tiktok_posts;

create policy "Users can view their own TikTok posts"
  on public.tiktok_posts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own TikTok posts"
  on public.tiktok_posts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own TikTok posts"
  on public.tiktok_posts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own TikTok posts"
  on public.tiktok_posts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists tiktok_posts_user_schedule_idx
  on public.tiktok_posts (user_id, scheduled_for, created_at desc);

create unique index if not exists tiktok_posts_publish_id_unique
  on public.tiktok_posts (publish_id)
  where publish_id is not null;
