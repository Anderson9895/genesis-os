-- FieldLedger founding-lead mirror (additive).
--
-- The public FieldLedger AI sales page (chatgpt.site host, NOT in this repo and
-- NOT touched here) captures founding-farm leads through ITS OWN /api/leads.
-- This table mirrors those inbound leads into our Supabase so the owner has a
-- single business-owned lead list. No existing table, row, migration, or
-- feature is modified; this is purely additive.
--
-- Security shape (deliberate):
--   * anon has NO grants on this table at all — nothing is exposed to the
--     public database API, and there is no public `insert` grant anywhere.
--   * Writes happen ONLY through our serverless API endpoint
--     (api/fieldledger/leads.js) using an env-guarded service-role client,
--     which bypasses RLS. If that key is absent the endpoint refuses (503).
--   * Authenticated owner reads/writes are gated on an owner-reference row in
--     public.app_settings (key 'fieldledger_owner_user_id' = auth.users id).
--     This keeps the repo's auth.uid() policy style without hardcoding a user
--     uuid/email in SQL; until that row is provisioned the gate is closed.
--
-- updated_at follows the repo convention (managed at app level; the mirror
-- endpoint is insert-only, so no app-level update exists yet).

create table if not exists public.fieldledger_leads (
  id uuid primary key default gen_random_uuid(),
  farm_name text not null,
  contact_name text not null,
  email text not null,
  acre_range text,
  source text not null default 'chatgpt.site',
  status text not null default 'new'
    check (status in ('new', 'contacted', 'onboarded', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent dedup: one lead per email (case-insensitive).
create unique index if not exists fieldledger_leads_email_lower_idx
  on public.fieldledger_leads (lower(email));

-- Useful for the owner's list view once the mirror is live.
create index if not exists fieldledger_leads_status_created_idx
  on public.fieldledger_leads (status, created_at desc);

alter table public.fieldledger_leads enable row level security;

-- anon: no grants at all. INSERT is intentionally NOT granted to anyone:
-- only the service-role API client can insert (bypasses RLS).
revoke all on table public.fieldledger_leads from anon;
grant select, update, delete on table public.fieldledger_leads to authenticated;

drop policy if exists "Owner can view FieldLedger leads" on public.fieldledger_leads;
drop policy if exists "Owner can update FieldLedger leads" on public.fieldledger_leads;
drop policy if exists "Owner can delete FieldLedger leads" on public.fieldledger_leads;

create policy "Owner can view FieldLedger leads"
  on public.fieldledger_leads
  for select
  to authenticated
  using (
    (select auth.uid()) = (select value::uuid from public.app_settings where key = 'fieldledger_owner_user_id')
  );

create policy "Owner can update FieldLedger leads"
  on public.fieldledger_leads
  for update
  to authenticated
  using (
    (select auth.uid()) = (select value::uuid from public.app_settings where key = 'fieldledger_owner_user_id')
  )
  with check (
    (select auth.uid()) = (select value::uuid from public.app_settings where key = 'fieldledger_owner_user_id')
  );

create policy "Owner can delete FieldLedger leads"
  on public.fieldledger_leads
  for delete
  to authenticated
  using (
    (select auth.uid()) = (select value::uuid from public.app_settings where key = 'fieldledger_owner_user_id')
  );

-- Owner-reference store used by the policies above (closed by default: no rows
-- are seeded because the owner uuid is not guessed). Ownership is provisioned
-- later by inserting { key: 'fieldledger_owner_user_id', value: <owner uuid> }.
-- authenticated needs SELECT here only so the policy subquery can resolve the
-- owner id; anon is fully revoked.
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

revoke all on table public.app_settings from anon;
grant select on table public.app_settings to authenticated;