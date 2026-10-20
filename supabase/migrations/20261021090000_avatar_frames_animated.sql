-- Animated avatar frames (APNG / animated WebP) with still fallbacks, and file
-- metadata verified on the server. Apply AFTER 20261020090000_avatar_frames.sql.
-- Safe to re-run. Existing static frames keep working unchanged.
--
-- Trust model: an admin uploads a file to the avatar-frames bucket, then the
-- avatar-frame-inspect Edge Function reads the stored bytes and records what it
-- found (format, size, frames, duration) through avatar_frame_record_upload(),
-- which only the service role may call. admin_save_avatar_frame() copies that
-- recorded metadata; nothing technical is taken from the browser.
begin;

-- ─── Verified uploads ────────────────────────────────────────────────────────

create table if not exists public.avatar_frame_uploads (
  path text primary key,
  format text not null,
  frame_type text not null,
  width integer not null,
  height integer not null,
  file_size integer not null,
  frame_count integer not null default 1,
  duration_ms integer,
  inspected_by uuid,
  inspected_at timestamptz not null default now(),
  constraint avatar_frame_uploads_path_check check (path ~ '^frames/[0-9a-f-]{36}\.(png|webp)$'),
  constraint avatar_frame_uploads_size_check check (
    width = height and width between 128 and 512 and file_size between 1 and 2097152
  ),
  constraint avatar_frame_uploads_kind_check check (
    (frame_type = 'static' and format in ('png', 'webp') and frame_count = 1 and duration_ms is null)
    or (frame_type = 'animated' and format in ('apng', 'webp') and frame_count between 2 and 120
      and duration_ms between 1000 and 10000)
  )
);

alter table public.avatar_frame_uploads enable row level security;
drop policy if exists avatar_frame_uploads_admin_read on public.avatar_frame_uploads;
create policy avatar_frame_uploads_admin_read on public.avatar_frame_uploads
for select to authenticated using ((select public.is_admin()));
revoke all on table public.avatar_frame_uploads from anon, authenticated;
grant select on table public.avatar_frame_uploads to authenticated;

-- Called by the Edge Function with the service role after it parsed the stored
-- file. The recorded size must match what Storage holds for that object.
create or replace function public.avatar_frame_record_upload(p_path text, p_info jsonb, p_inspected_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_size bigint;
  v_row public.avatar_frame_uploads;
begin
  select nullif(o.metadata->>'size', '')::bigint into v_size
  from storage.objects o
  where o.bucket_id = 'avatar-frames' and o.name = p_path;

  if not found then
    raise exception 'Không tìm thấy file trong bucket avatar-frames.' using errcode = 'P0002';
  end if;

  if v_size is not null and v_size is distinct from (p_info->>'file_size')::bigint then
    raise exception 'Dung lượng file không khớp với Storage.' using errcode = '22023';
  end if;

  insert into public.avatar_frame_uploads (path, format, frame_type, width, height, file_size, frame_count, duration_ms, inspected_by, inspected_at)
  values (
    p_path,
    p_info->>'format',
    p_info->>'frame_type',
    (p_info->>'width')::integer,
    (p_info->>'height')::integer,
    (p_info->>'file_size')::integer,
    coalesce((p_info->>'frame_count')::integer, 1),
    (p_info->>'duration_ms')::integer,
    p_inspected_by,
    now()
  )
  on conflict (path) do update set
    format = excluded.format,
    frame_type = excluded.frame_type,
    width = excluded.width,
    height = excluded.height,
    file_size = excluded.file_size,
    frame_count = excluded.frame_count,
    duration_ms = excluded.duration_ms,
    inspected_by = excluded.inspected_by,
    inspected_at = excluded.inspected_at
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.avatar_frame_record_upload(text, jsonb, uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.avatar_frame_record_upload(text, jsonb, uuid) to service_role;
  end if;
end $$;

-- ─── Catalog columns ─────────────────────────────────────────────────────────

alter table public.avatar_frames
  add column if not exists frame_type text not null default 'static',
  add column if not exists image_format text,
  add column if not exists fallback_path text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists file_size integer,
  add column if not exists frame_count integer not null default 1,
  add column if not exists duration_ms integer;

-- Frames created before this migration were static (animated files were refused).
update public.avatar_frames
set image_format = case when image_source = 'builtin' then 'svg' else substring(image_path from '\.([a-z]+)$') end
where image_format is null;

alter table public.avatar_frames alter column image_format set not null;

alter table public.avatar_frames drop constraint if exists avatar_frames_image_check;
alter table public.avatar_frames add constraint avatar_frames_image_check check (
  (image_source = 'builtin' and image_path ~ '^[a-z0-9-]{1,64}\.(svg|png|webp)$'
    and (fallback_path is null or fallback_path ~ '^[a-z0-9-]{1,64}\.(png|webp)$'))
  or (image_source = 'storage' and image_path ~ '^frames/[0-9a-f-]{36}\.(png|webp)$'
    and (fallback_path is null or fallback_path ~ '^frames/[0-9a-f-]{36}\.(png|webp)$'))
);

alter table public.avatar_frames drop constraint if exists avatar_frames_kind_check;
alter table public.avatar_frames add constraint avatar_frames_kind_check check (
  (frame_type = 'static' and image_format in ('svg', 'png', 'webp') and frame_count = 1
    and duration_ms is null and fallback_path is null)
  or (frame_type = 'animated' and image_format in ('apng', 'webp') and frame_count between 2 and 120
    and duration_ms between 1000 and 10000)
);

-- An animated frame can only be active with a still fallback.
alter table public.avatar_frames drop constraint if exists avatar_frames_fallback_check;
alter table public.avatar_frames add constraint avatar_frames_fallback_check check (
  frame_type = 'static' or fallback_path is not null or not is_active
);

-- Rows uploaded before this migration have no recorded size (NULL).
alter table public.avatar_frames drop constraint if exists avatar_frames_metadata_check;
alter table public.avatar_frames add constraint avatar_frames_metadata_check check (
  (width is null or (width = height and width between 1 and 4096))
  and (file_size is null or file_size between 1 and 2097152)
);

create unique index if not exists avatar_frames_fallback_idx
on public.avatar_frames (image_source, fallback_path) where fallback_path is not null;

-- ─── Admin RPCs ──────────────────────────────────────────────────────────────

-- A verified upload that is still in the bucket and not used by another frame.
create or replace function public.avatar_frames_usable_upload(p_path text, p_frame_id text)
returns public.avatar_frame_uploads
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_upload public.avatar_frame_uploads;
begin
  select u.* into v_upload
  from public.avatar_frame_uploads u
  join storage.objects o on o.bucket_id = 'avatar-frames' and o.name = u.path
  where u.path = p_path
    and (nullif(o.metadata->>'size', '') is null or (o.metadata->>'size')::bigint = u.file_size);

  if not found or exists (
    select 1 from public.avatar_frames f
    where f.image_source = 'storage'
      and (f.image_path = p_path or f.fallback_path = p_path)
      and f.id is distinct from p_frame_id
  ) then
    raise exception 'Ảnh khung chưa được máy chủ kiểm tra, không còn tồn tại hoặc đang được khung khác dùng.' using errcode = '22023';
  end if;

  return v_upload;
end;
$$;

revoke all on function public.avatar_frames_usable_upload(text, text) from public, anon, authenticated;

-- Create (p_id NULL) or edit a frame.
-- p_document: { name, is_active?, image_path?, fallback_path?, remove_fallback? }
--   image_path / fallback_path: files recorded by the avatar-frame-inspect function.
--   Technical metadata comes from avatar_frame_uploads, never from p_document.
-- Returns { frame, removed_paths }: uploaded files no frame uses any more, which
-- the caller may now delete from Storage.
create or replace function public.admin_save_avatar_frame(p_id text, p_document jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_document->>'name', ''));
  v_image_path text := nullif(btrim(coalesce(p_document->>'image_path', '')), '');
  v_fallback_path text := nullif(btrim(coalesce(p_document->>'fallback_path', '')), '');
  v_remove_fallback boolean := coalesce((p_document->>'remove_fallback')::boolean, false);
  v_image public.avatar_frame_uploads;
  v_fallback public.avatar_frame_uploads;
  v_old public.avatar_frames;
  v_new public.avatar_frames;
  v_row public.avatar_frames;
  v_removed text[] := '{}';
begin
  perform public.avatar_frames_require_admin();

  if p_document is null
    or jsonb_typeof(p_document) is distinct from 'object'
    or char_length(v_name) not between 1 and 60
    or (p_document ? 'is_active' and jsonb_typeof(p_document->'is_active') is distinct from 'boolean')
    or (p_document ? 'remove_fallback' and jsonb_typeof(p_document->'remove_fallback') is distinct from 'boolean')
    or (v_fallback_path is not null and v_remove_fallback) then
    raise exception 'Thông tin khung không hợp lệ.' using errcode = '22023';
  end if;

  if p_id is null then
    if v_image_path is null then
      raise exception 'Hãy chọn ảnh cho khung mới.' using errcode = '22023';
    end if;
    v_new.id := 'frame-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    v_new.is_active := coalesce((p_document->>'is_active')::boolean, true);
    v_new.sort_order := least(coalesce((select max(sort_order) from public.avatar_frames), 0) + 1, 100000);
  else
    select * into v_old from public.avatar_frames where id = p_id for update;
    if not found then
      raise exception 'Không tìm thấy khung avatar. Hãy tải lại danh sách.' using errcode = 'P0002';
    end if;
    v_new := v_old;
    v_new.is_active := coalesce((p_document->>'is_active')::boolean, v_old.is_active);
  end if;
  v_new.name := v_name;

  if v_image_path is not null then
    v_image := public.avatar_frames_usable_upload(v_image_path, p_id);
    -- A built-in still cannot stay with an uploaded animation.
    if v_new.image_source is distinct from 'storage' then
      v_new.fallback_path := null;
    end if;
    v_new.image_source := 'storage';
    v_new.image_path := v_image.path;
    v_new.image_format := v_image.format;
    v_new.frame_type := v_image.frame_type;
    v_new.width := v_image.width;
    v_new.height := v_image.height;
    v_new.file_size := v_image.file_size;
    v_new.frame_count := v_image.frame_count;
    v_new.duration_ms := v_image.duration_ms;
  end if;

  if v_fallback_path is not null then
    if v_new.frame_type is distinct from 'animated' or v_new.image_source is distinct from 'storage' then
      raise exception 'Chỉ khung động tải lên mới cần ảnh dự phòng.' using errcode = '22023';
    end if;
    v_fallback := public.avatar_frames_usable_upload(v_fallback_path, p_id);
    if v_fallback.frame_type <> 'static' or v_fallback.path = v_new.image_path then
      raise exception 'Ảnh dự phòng phải là ảnh PNG hoặc WebP tĩnh.' using errcode = '22023';
    end if;
    v_new.fallback_path := v_fallback.path;
  elsif v_remove_fallback or v_new.frame_type = 'static' then
    v_new.fallback_path := null;
  end if;

  if v_new.frame_type = 'animated' and v_new.is_active and v_new.fallback_path is null then
    raise exception 'Khung động cần ảnh tĩnh dự phòng trước khi bật.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.avatar_frames (id, name, image_source, image_path, sort_order, is_active, frame_type, image_format,
      fallback_path, width, height, file_size, frame_count, duration_ms)
    values (v_new.id, v_new.name, v_new.image_source, v_new.image_path, v_new.sort_order, v_new.is_active, v_new.frame_type,
      v_new.image_format, v_new.fallback_path, v_new.width, v_new.height, v_new.file_size, v_new.frame_count, v_new.duration_ms)
    returning * into v_row;
  else
    update public.avatar_frames set
      name = v_new.name,
      is_active = v_new.is_active,
      image_source = v_new.image_source,
      image_path = v_new.image_path,
      frame_type = v_new.frame_type,
      image_format = v_new.image_format,
      fallback_path = v_new.fallback_path,
      width = v_new.width,
      height = v_new.height,
      file_size = v_new.file_size,
      frame_count = v_new.frame_count,
      duration_ms = v_new.duration_ms,
      updated_at = now()
    where id = p_id
    returning * into v_row;

    if v_old.image_source = 'storage' then
      if v_old.image_path is distinct from v_row.image_path
        and v_old.image_path is distinct from v_row.fallback_path then
        v_removed := v_removed || v_old.image_path;
      end if;
      if v_old.fallback_path is not null
        and v_old.fallback_path is distinct from v_row.fallback_path
        and v_old.fallback_path is distinct from v_row.image_path then
        v_removed := v_removed || v_old.fallback_path;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'frame', to_jsonb(v_row) || jsonb_build_object(
      'usage_count', (select count(*) from public.profiles p where p.avatar_frame_id = v_row.id)
    ),
    'removed_paths', to_jsonb(v_removed),
    -- Kept for clients built against the first version of this RPC.
    'previous_image_path', (
      select x from unnest(v_removed) as x
      where v_old.image_source = 'storage' and x = v_old.image_path
    )
  );
end;
$$;

-- Deletes a frame; profiles using it fall back to no frame (ON DELETE SET NULL).
-- Returns { id, affected_users, image_path, removed_paths }.
create or replace function public.admin_delete_avatar_frame(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.avatar_frames;
  v_count bigint;
  v_removed text[] := '{}';
begin
  perform public.avatar_frames_require_admin();

  select * into v_row from public.avatar_frames where id = p_id for update;
  if not found then
    raise exception 'Không tìm thấy khung avatar. Hãy tải lại danh sách.' using errcode = 'P0002';
  end if;

  select count(*) into v_count from public.profiles where avatar_frame_id = p_id;
  delete from public.avatar_frames where id = p_id;

  if v_row.image_source = 'storage' then
    v_removed := array_remove(array[v_row.image_path, v_row.fallback_path], null);
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'affected_users', v_count,
    'image_path', case when v_row.image_source = 'storage' then v_row.image_path end,
    'removed_paths', to_jsonb(v_removed)
  );
end;
$$;

revoke all on function public.admin_save_avatar_frame(text, jsonb), public.admin_delete_avatar_frame(text) from public, anon;
grant execute on function public.admin_save_avatar_frame(text, jsonb), public.admin_delete_avatar_frame(text) to authenticated;

-- ─── Storage ─────────────────────────────────────────────────────────────────

-- APNG is stored as image/png (the content type the client sets from the inspected bytes).
update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/webp']
where id = 'avatar-frames';

-- A file can be removed only while no frame uses it as its image or fallback.
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
      where f.image_source = 'storage' and (f.image_path = p_path or f.fallback_path = p_path)
    );
$$;

-- ─── Built-in animated frames ───────────────────────────────────────────────
-- Files from scripts/generate-avatar-frames.mjs; metadata checked by
-- tests/avatarFramesDatabase.test.mjs against the files in public/avatar-frames/.

with seeds (id, name, image_path, image_format, fallback_path, width, file_size, frame_count, duration_ms, position) as (
  values
    ('orbit-glow', 'Vầng sáng xoay', 'orbit-glow.png', 'apng', 'orbit-glow-still.png', 256, 510358, 30, 2400, 1),
    ('twinkle-stars', 'Sao lấp lánh', 'twinkle-stars.webp', 'webp', 'twinkle-stars-still.png', 256, 325892, 24, 2400, 2)
)
insert into public.avatar_frames (id, name, image_source, image_path, sort_order, frame_type, image_format, fallback_path,
  width, height, file_size, frame_count, duration_ms)
select s.id, s.name, 'builtin', s.image_path,
  least(coalesce((select max(sort_order) from public.avatar_frames), 0) + s.position, 100000),
  'animated', s.image_format, s.fallback_path, s.width, s.width, s.file_size, s.frame_count, s.duration_ms
from seeds s
where not exists (select 1 from public.avatar_frame_seed_log l where l.id = s.id)
on conflict (id) do nothing;

insert into public.avatar_frame_seed_log (id) values ('orbit-glow'), ('twinkle-stars')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
commit;
