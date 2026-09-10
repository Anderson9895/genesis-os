-- Private farm/ranch document attachments: invoices, photos, receipts and other
-- files linked to farm records. Additive only — no existing table, row, or
-- feature is modified. Storage is private (per-user path first segment) with no
-- public/anonymous read anywhere, mirroring the finance-receipts pattern.
--
-- NOTE on record_id type: the owning record tables (farm_fields, farm_applications,
-- farm_harvests, farm_costs, livestock_records, finance_transactions) all use
-- bigint identity primary keys, so record_id is declared text (not uuid) to store
-- the literal record id losslessly. Values are the owning row's id, as text.

create table if not exists public.farm_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null,
  record_id text not null,
  file_name text not null,
  file_path text not null unique,
  mime_type text,
  size_bytes bigint,
  caption text,
  created_at timestamptz not null default now()
);

alter table public.farm_documents enable row level security;

revoke all on table public.farm_documents from anon;
grant select, insert, update, delete on table public.farm_documents to authenticated;

drop policy if exists "Users can view their own farm documents" on public.farm_documents;
drop policy if exists "Users can insert their own farm documents" on public.farm_documents;
drop policy if exists "Users can update their own farm documents" on public.farm_documents;
drop policy if exists "Users can delete their own farm documents" on public.farm_documents;

create policy "Users can view their own farm documents"
  on public.farm_documents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own farm documents"
  on public.farm_documents
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own farm documents"
  on public.farm_documents
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own farm documents"
  on public.farm_documents
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists farm_documents_user_record_idx
  on public.farm_documents (user_id, record_type, record_id);

-- Private storage bucket: first path segment is the owner's user id.
insert into storage.buckets (id, name, public)
values ('farm-documents', 'farm-documents', false)
on conflict (id) do nothing;

-- Defense in depth: never allow a public bucket even if one was pre-created.
update storage.buckets
set public = false
where id = 'farm-documents';

drop policy if exists "Users can view their own farm documents" on storage.objects;
drop policy if exists "Users can upload their own farm documents" on storage.objects;
drop policy if exists "Users can update their own farm documents" on storage.objects;
drop policy if exists "Users can delete their own farm documents" on storage.objects;

create policy "Users can view their own farm documents"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'farm-documents'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy "Users can upload their own farm documents"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'farm-documents'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy "Users can update their own farm documents"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'farm-documents'
    and split_part(name, '/', 1) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'farm-documents'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy "Users can delete their own farm documents"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'farm-documents'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );