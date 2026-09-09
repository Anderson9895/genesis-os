-- Mirror of the additive outreach_leads hardening already applied in production.
-- This migration preserves all rows and changes only grants, index coverage, and RLS policies.

create index if not exists outreach_leads_user_id_idx
  on public.outreach_leads (user_id);

revoke all privileges on table public.outreach_leads from anon;
grant select, insert, update, delete on table public.outreach_leads to authenticated;

drop policy if exists "Users can view their own outreach leads" on public.outreach_leads;
drop policy if exists "Users can insert their own outreach leads" on public.outreach_leads;
drop policy if exists "Users can update their own outreach leads" on public.outreach_leads;
drop policy if exists "Users can delete their own outreach leads" on public.outreach_leads;

create policy "Users can view their own outreach leads"
  on public.outreach_leads
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own outreach leads"
  on public.outreach_leads
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own outreach leads"
  on public.outreach_leads
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own outreach leads"
  on public.outreach_leads
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
