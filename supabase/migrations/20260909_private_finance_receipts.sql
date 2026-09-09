-- Make financial receipt uploads private and owner-readable.
-- There were no stored receipt objects when this migration was prepared.

update storage.buckets
set public = false
where id = 'finance-receipts';

drop policy if exists "Public can view finance receipts" on storage.objects;
drop policy if exists "Users can view their own finance receipts" on storage.objects;

create policy "Users can view their own finance receipts"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'finance-receipts'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );
