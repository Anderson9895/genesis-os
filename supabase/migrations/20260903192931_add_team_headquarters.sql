begin;
create table if not exists public.hq_agents (
 user_id uuid not null references auth.users(id) on delete cascade,
 role_id text not null check (length(role_id) between 1 and 100),
 enrolled_at timestamptz not null default now(),
 primary key (user_id, role_id)
);
create table if not exists public.hq_journal (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (length(title) between 1 and 200),
 body text not null check (length(body) between 1 and 10000),
 created_at timestamptz not null default now()
);
create index if not exists hq_journal_user_created on public.hq_journal(user_id, created_at desc);
alter table public.hq_agents enable row level security;
alter table public.hq_journal enable row level security;
revoke all on public.hq_agents, public.hq_journal from anon, authenticated;
grant select, insert on public.hq_agents, public.hq_journal to authenticated;
create policy hq_agents_select on public.hq_agents for select to authenticated using ((select auth.uid()) = user_id);
create policy hq_agents_insert on public.hq_agents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy hq_journal_select on public.hq_journal for select to authenticated using ((select auth.uid()) = user_id);
create policy hq_journal_insert on public.hq_journal for insert to authenticated with check ((select auth.uid()) = user_id);
commit;
