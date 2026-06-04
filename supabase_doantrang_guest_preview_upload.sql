alter table storage.objects enable row level security;

drop policy if exists "storage_doantrang_guest_preview_insert_anon" on storage.objects;
create policy "storage_doantrang_guest_preview_insert_anon"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'user-images'
  and storage.extension(name) in ('png', 'jpg', 'jpeg', 'webp')
);
