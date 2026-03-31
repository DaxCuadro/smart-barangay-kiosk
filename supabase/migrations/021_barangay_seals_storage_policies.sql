-- Create the barangay-seals storage bucket (public, so generated PDFs can load the image)
insert into storage.buckets (id, name, public)
values ('barangay-seals', 'barangay-seals', true)
on conflict (id) do nothing;

-- Allow any authenticated user to upload / update seal images
create policy "seals_insert_authed"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'barangay-seals');

create policy "seals_update_authed"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'barangay-seals')
  with check (bucket_id = 'barangay-seals');

-- Allow public read (bucket is already public, but policy is needed with RLS enabled)
create policy "seals_read_public"
  on storage.objects for select
  to public
  using (bucket_id = 'barangay-seals');

-- Allow authenticated users to delete old seals
create policy "seals_delete_authed"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'barangay-seals');
