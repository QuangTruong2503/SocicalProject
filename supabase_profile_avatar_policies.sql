alter table public.profiles enable row level security;
alter table public.user_uploads enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "user_uploads_select_own" on public.user_uploads;
create policy "user_uploads_select_own"
on public.user_uploads
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_uploads_insert_own" on public.user_uploads;
create policy "user_uploads_insert_own"
on public.user_uploads
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_uploads_delete_own" on public.user_uploads;
create policy "user_uploads_delete_own"
on public.user_uploads
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "storage_user_images_select_own" on storage.objects;
create policy "storage_user_images_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'user-images'
  and owner_id = auth.uid()::text
);

drop policy if exists "storage_user_images_insert_own" on storage.objects;
create policy "storage_user_images_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'user-images'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_user_images_delete_own" on storage.objects;
create policy "storage_user_images_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'user-images'
  and owner_id = auth.uid()::text
);

drop policy if exists "storage_user_images_update_own" on storage.objects;
create policy "storage_user_images_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'user-images'
  and owner_id = auth.uid()::text
)
with check (
  bucket_id = 'user-images'
  and owner_id = auth.uid()::text
);
