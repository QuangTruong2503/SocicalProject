-- Avatar frames: catalog, the frame each user picked, admin management and Storage.
-- Requires public.profiles, public.is_admin() and public.is_active_user()
-- (supabase_admin_profiles_policies.sql) and the column grants of
-- supabase_profiles_auth_sync.sql. Safe to re-run.
--
-- Frame images are square. The avatar is drawn as a circle whose diameter is
-- 1/1.3 (≈77%) of the frame side, centred; the frame may extend past it.
-- Built-in frames are SVG files shipped in public/avatar-frames/. Frames added
-- by admins are static PNG/WebP files in the public `avatar-frames` bucket.
begin;

-- ─── Catalog ─────────────────────────────────────────────────────────────────

create table if not exists public.avatar_frames (
  id text primary key,
  name text not null,
  image_source text not null,
  image_path text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avatar_frames_id_check check (id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  constraint avatar_frames_name_check check (name = btrim(name) and char_length(name) between 1 and 60),
  constraint avatar_frames_image_check check (
    (image_source = 'builtin' and image_path ~ '^[a-z0-9-]{1,64}\.svg$')
    or (image_source = 'storage' and image_path ~ '^frames/[0-9a-f-]{36}\.(png|webp)$')
  ),
  constraint avatar_frames_sort_order_check check (sort_order between 0 and 100000)
);

-- One file belongs to one frame, so removing a frame's file never breaks another.
create unique index if not exists avatar_frames_image_idx on public.avatar_frames (image_source, image_path);
create index if not exists avatar_frames_order_idx on public.avatar_frames (sort_order, created_at, id);

alter table public.avatar_frames enable row level security;

drop policy if exists avatar_frames_read on public.avatar_frames;
create policy avatar_frames_read on public.avatar_frames
for select to authenticated
using (is_active or (select public.is_admin()));

-- Admins write through the RPCs below only.
revoke all on table public.avatar_frames from anon;
revoke insert, update, delete, truncate, references, trigger on table public.avatar_frames from authenticated;
grant select on table public.avatar_frames to authenticated;

-- ─── Selection on the profile ───────────────────────────────────────────────

alter table public.profiles add column if not exists avatar_frame_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_frame_id_fkey' and conrelid = 'public.profiles'::regclass
  ) then
    -- Deleting a frame clears it from every profile; the avatar then shows without a frame.
    alter table public.profiles
      add constraint profiles_avatar_frame_id_fkey
      foreign key (avatar_frame_id) references public.avatar_frames (id) on delete set null;
  end if;
end $$;

create index if not exists profiles_avatar_frame_id_idx
on public.profiles (avatar_frame_id) where avatar_frame_id is not null;

-- Users change their frame through set_my_avatar_frame() only. The column is
-- not in the column grants of supabase_profiles_auth_sync.sql; revoke anyway
-- in case it was granted by hand.
revoke insert (avatar_frame_id), update (avatar_frame_id) on public.profiles from anon, authenticated;

-- Defence in depth: whatever path writes the column (RPC, a leftover table-level
-- grant, an admin tool), a frame can only be newly picked while it is active.
-- Clearing it (including the ON DELETE SET NULL above) is always allowed.
create or replace function public.avatar_frames_guard_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.avatar_frame_id is null
    or (tg_op = 'UPDATE' and new.avatar_frame_id is not distinct from old.avatar_frame_id) then
    return new;
  end if;

  perform 1 from public.avatar_frames f where f.id = new.avatar_frame_id and f.is_active for share;

  if not found then
    raise exception 'Khung avatar không tồn tại hoặc đã ngừng sử dụng.' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.avatar_frames_guard_profile() from public, anon, authenticated;

drop trigger if exists profiles_avatar_frame_guard on public.profiles;
create trigger profiles_avatar_frame_guard
before insert or update of avatar_frame_id on public.profiles
for each row execute function public.avatar_frames_guard_profile();

-- Changes only the caller's own avatar_frame_id (and updated_at). NULL removes the frame.
create or replace function public.set_my_avatar_frame(p_frame_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_frame_id text := nullif(btrim(coalesce(p_frame_id, '')), '');
  v_saved text;
begin
  if v_uid is null or not coalesce(public.is_active_user(), false) then
    raise exception 'Vui lòng đăng nhập bằng tài khoản đang hoạt động.' using errcode = '42501';
  end if;

  if v_frame_id is not null then
    perform 1 from public.avatar_frames f where f.id = v_frame_id and f.is_active for share;

    if not found then
      raise exception 'Khung avatar không tồn tại hoặc đã ngừng sử dụng.' using errcode = '22023';
    end if;
  end if;

  update public.profiles
  set avatar_frame_id = v_frame_id, updated_at = now()
  where id = v_uid
  returning avatar_frame_id into v_saved;

  if not found then
    raise exception 'Không tìm thấy hồ sơ người dùng.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('avatar_frame_id', v_saved);
end;
$$;

revoke all on function public.set_my_avatar_frame(text) from public, anon;
grant execute on function public.set_my_avatar_frame(text) to authenticated;

-- ─── Admin management ────────────────────────────────────────────────────────

create or replace function public.avatar_frames_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên mới được quản lý khung avatar.' using errcode = '42501';
  end if;
end;
$$;

-- Every frame (active or not) in display order, with the number of users on it.
create or replace function public.admin_list_avatar_frames()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.avatar_frames_require_admin();

  return coalesce((
    select jsonb_agg(
      to_jsonb(f) || jsonb_build_object(
        'usage_count', (select count(*) from public.profiles p where p.avatar_frame_id = f.id)
      )
      order by f.sort_order, f.created_at, f.id
    )
    from public.avatar_frames f
  ), '[]'::jsonb);
end;
$$;

-- Create (p_id NULL) or edit a frame. p_document: { name, is_active?, image_path? }.
-- image_path must be a file already uploaded to the avatar-frames bucket and not
-- used by another frame. Returns { frame, previous_image_path }: the old file the
-- caller may now delete after an image change.
create or replace function public.admin_save_avatar_frame(p_id text, p_document jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_document->>'name', ''));
  v_path text := nullif(btrim(coalesce(p_document->>'image_path', '')), '');
  v_old public.avatar_frames;
  v_row public.avatar_frames;
  v_previous text;
begin
  perform public.avatar_frames_require_admin();

  if p_document is null
    or jsonb_typeof(p_document) is distinct from 'object'
    or char_length(v_name) not between 1 and 60
    or (p_document ? 'is_active' and jsonb_typeof(p_document->'is_active') is distinct from 'boolean') then
    raise exception 'Thông tin khung không hợp lệ.' using errcode = '22023';
  end if;

  if v_path is not null and (
    v_path !~ '^frames/[0-9a-f-]{36}\.(png|webp)$'
    or not exists (select 1 from storage.objects o where o.bucket_id = 'avatar-frames' and o.name = v_path)
    or exists (
      select 1 from public.avatar_frames f
      where f.image_source = 'storage' and f.image_path = v_path and f.id is distinct from p_id
    )
  ) then
    raise exception 'Ảnh khung tải lên không hợp lệ hoặc không còn tồn tại.' using errcode = '22023';
  end if;

  if p_id is null then
    if v_path is null then
      raise exception 'Hãy chọn ảnh cho khung mới.' using errcode = '22023';
    end if;

    insert into public.avatar_frames (id, name, image_source, image_path, sort_order, is_active)
    values (
      'frame-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
      v_name,
      'storage',
      v_path,
      least(coalesce((select max(sort_order) from public.avatar_frames), 0) + 1, 100000),
      coalesce((p_document->>'is_active')::boolean, true)
    )
    returning * into v_row;
  else
    select * into v_old from public.avatar_frames where id = p_id for update;

    if not found then
      raise exception 'Không tìm thấy khung avatar. Hãy tải lại danh sách.' using errcode = 'P0002';
    end if;

    update public.avatar_frames set
      name = v_name,
      is_active = coalesce((p_document->>'is_active')::boolean, is_active),
      image_source = case when v_path is null then image_source else 'storage' end,
      image_path = coalesce(v_path, image_path),
      updated_at = now()
    where id = p_id
    returning * into v_row;

    if v_old.image_source = 'storage' and v_old.image_path is distinct from v_row.image_path then
      v_previous := v_old.image_path;
    end if;
  end if;

  return jsonb_build_object(
    'frame', to_jsonb(v_row) || jsonb_build_object(
      'usage_count', (select count(*) from public.profiles p where p.avatar_frame_id = v_row.id)
    ),
    'previous_image_path', v_previous
  );
end;
$$;

-- Deletes a frame. Profiles using it fall back to no frame (ON DELETE SET NULL).
-- Returns { id, affected_users, image_path }; image_path is the uploaded file the
-- caller may now delete (NULL for built-in frames).
create or replace function public.admin_delete_avatar_frame(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.avatar_frames;
  v_count bigint;
begin
  perform public.avatar_frames_require_admin();

  select * into v_row from public.avatar_frames where id = p_id for update;

  if not found then
    raise exception 'Không tìm thấy khung avatar. Hãy tải lại danh sách.' using errcode = 'P0002';
  end if;

  select count(*) into v_count from public.profiles where avatar_frame_id = p_id;
  delete from public.avatar_frames where id = p_id;

  return jsonb_build_object(
    'id', v_row.id,
    'affected_users', v_count,
    'image_path', case when v_row.image_source = 'storage' then v_row.image_path end
  );
end;
$$;

-- p_ids must list every frame exactly once, in the new order. A list built from
-- an outdated view (frame added or deleted meanwhile) is rejected.
create or replace function public.admin_reorder_avatar_frames(p_ids text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.avatar_frames_require_admin();
  perform 1 from public.avatar_frames for update;

  if p_ids is null
    or cardinality(p_ids) <> (select count(*) from public.avatar_frames)
    or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) as x)
    or exists (
      select 1 from unnest(p_ids) as x
      where not exists (select 1 from public.avatar_frames f where f.id = x)
    ) then
    raise exception 'Danh sách khung đã thay đổi. Hãy tải lại rồi sắp xếp lại.' using errcode = '40001';
  end if;

  update public.avatar_frames f
  set sort_order = o.position, updated_at = now()
  from unnest(p_ids) with ordinality as o(id, position)
  where f.id = o.id and f.sort_order <> o.position;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function
  public.avatar_frames_require_admin(),
  public.admin_list_avatar_frames(),
  public.admin_save_avatar_frame(text, jsonb),
  public.admin_delete_avatar_frame(text),
  public.admin_reorder_avatar_frames(text[])
from public, anon;
grant execute on function
  public.avatar_frames_require_admin(),
  public.admin_list_avatar_frames(),
  public.admin_save_avatar_frame(text, jsonb),
  public.admin_delete_avatar_frame(text),
  public.admin_reorder_avatar_frames(text[])
to authenticated;

-- ─── Storage ─────────────────────────────────────────────────────────────────

-- Public read (frames are decoration shown to everyone); only admins write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatar-frames', 'avatar-frames', true, 1048576, array['image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A file can be removed only while no frame points at it: an orphan from a failed
-- save, or the old image after a replacement or a delete.
create or replace function public.avatar_frames_can_remove_image(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_admin(), false)
    and not exists (
      select 1 from public.avatar_frames f
      where f.image_source = 'storage' and f.image_path = p_path
    );
$$;

revoke all on function public.avatar_frames_can_remove_image(text) from public, anon;
grant execute on function public.avatar_frames_can_remove_image(text) to authenticated;

drop policy if exists avatar_frame_images_admin_select on storage.objects;
create policy avatar_frame_images_admin_select on storage.objects
for select to authenticated
using (bucket_id = 'avatar-frames' and (select public.is_admin()));

drop policy if exists avatar_frame_images_admin_insert on storage.objects;
create policy avatar_frame_images_admin_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatar-frames'
  and (select public.is_admin())
  and name ~ '^frames/[0-9a-f-]{36}\.(png|webp)$'
);

drop policy if exists avatar_frame_images_admin_delete on storage.objects;
create policy avatar_frame_images_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'avatar-frames' and public.avatar_frames_can_remove_image(name));
-- No UPDATE policy: every upload has a new name, so a file in use is never overwritten.

-- ─── Built-in frames ────────────────────────────────────────────────────────

-- Remembers which built-in frames were seeded, so re-running this file does not
-- bring back a built-in frame an admin deleted.
create table if not exists public.avatar_frame_seed_log (
  id text primary key,
  seeded_at timestamptz not null default now()
);

alter table public.avatar_frame_seed_log enable row level security;
revoke all on table public.avatar_frame_seed_log from anon, authenticated;

with seeds (id, name, image_path, sort_order) as (
  values
    ('classic-ring', 'Viền cổ điển', 'classic-ring.svg', 1),
    ('laurel', 'Vòng nguyệt quế', 'laurel.svg', 2),
    ('starlight', 'Ánh sao', 'starlight.svg', 3),
    ('neon-glow', 'Neon', 'neon-glow.svg', 4),
    ('sakura', 'Hoa anh đào', 'sakura.svg', 5),
    ('royal-crown', 'Vương miện', 'royal-crown.svg', 6)
)
insert into public.avatar_frames (id, name, image_source, image_path, sort_order)
select s.id, s.name, 'builtin', s.image_path, s.sort_order
from seeds s
where not exists (select 1 from public.avatar_frame_seed_log l where l.id = s.id)
on conflict (id) do nothing;

insert into public.avatar_frame_seed_log (id)
values ('classic-ring'), ('laurel'), ('starlight'), ('neon-glow'), ('sakura'), ('royal-crown')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
commit;
