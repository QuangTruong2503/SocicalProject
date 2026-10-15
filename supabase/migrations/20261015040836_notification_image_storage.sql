-- Apply AFTER 20261015025117_user_notifications.sql. Safe to re-run.
-- Keep notification_private outside the Data API exposed schemas.
begin;
alter table notification_private.announcements add column if not exists image_path text;
create index if not exists notification_image_path_idx on notification_private.announcements (image_path)
  where image_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notification-images', 'notification-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function notification_private.can_read_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (public.is_admin() or exists (
    select 1 from notification_private.announcements n
    join notification_private.recipients r on r.notification_id = n.id
    where n.image_path = p_path and n.status = 'sent' and r.user_id = auth.uid()
  ));
$$;
create or replace function notification_private.can_delete_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.is_admin() and not exists (
    select 1 from notification_private.announcements n where n.image_path = p_path
  );
$$;
revoke all on function notification_private.can_read_image(text), notification_private.can_delete_image(text) from public, anon;
grant execute on function notification_private.can_read_image(text), notification_private.can_delete_image(text) to authenticated;

drop policy if exists notification_images_select on storage.objects;
create policy notification_images_select on storage.objects for select to authenticated
  using (bucket_id = 'notification-images' and notification_private.can_read_image(name));
drop policy if exists notification_images_insert on storage.objects;
create policy notification_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'notification-images' and (select public.is_active_user()) and (select public.is_admin())
    and split_part(name, '/', 1) = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$');
drop policy if exists notification_images_delete on storage.objects;
create policy notification_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'notification-images' and notification_private.can_delete_image(name));
-- No UPDATE policy: files have unique names and cannot overwrite images already sent.




create or replace function notification_private.save_draft(p_document jsonb, p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := notification_private.require_user(true);
  v_id uuid;
  v_targets uuid[];
  v_path text := nullif(btrim(p_document->>'image_path'), '');
  v_image text := nullif(btrim(p_document->>'image_url'), '');
  v_action text := nullif(btrim(p_document->>'action_url'), '');
  v_label text := nullif(btrim(p_document->>'action_label'), '');
begin
  if p_document is null or jsonb_typeof(p_document) is distinct from 'object'
    or length(btrim(coalesce(p_document->>'title', ''))) not between 1 and 160
    or length(btrim(coalesce(p_document->>'body', ''))) not between 1 and 10000
    or coalesce(p_document->>'priority', '') not in ('normal', 'important')
    or coalesce(p_document->>'audience', '') not in ('all', 'selected')
    or jsonb_typeof(p_document->'target_user_ids') is distinct from 'array' then
    raise exception 'Nội dung thông báo không hợp lệ.' using errcode = '22023';
  end if;
  if (v_image is not null and (length(v_image) > 2048 or v_image ~ '[[:space:]\\]' or v_image !~ '^https://[^/[:space:]\\]+'))
    or (v_action is not null and (length(v_action) > 2048
      or v_action ~ '[[:space:]\\]'
      or not (v_action ~ '^/([^/]|$)' or v_action ~ '^https://[^/[:space:]\\]+')))
    or ((v_action is null) <> (v_label is null)) or length(v_label) > 80 then
    raise exception 'Ảnh cần URL HTTPS; liên kết cần đường dẫn nội bộ hoặc HTTPS và nhãn nút.' using errcode = '22023';
  end if;
  if v_path is not null then
    if v_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'
      or not exists (select 1 from storage.objects o where o.bucket_id = 'notification-images' and o.name = v_path)
      or (split_part(v_path, '/', 1) <> v_uid::text and not exists (
        select 1 from notification_private.announcements n where n.id = p_id and n.image_path = v_path and n.status = 'draft'
      )) then
      raise exception 'Ảnh tải lên không hợp lệ hoặc không còn tồn tại.' using errcode = '22023';
    end if;
    v_image := null;
  end if;
  select coalesce(array_agg(distinct value::uuid), '{}'::uuid[]) into v_targets
    from jsonb_array_elements_text(p_document->'target_user_ids');
  if p_document->>'audience' = 'selected' and (cardinality(v_targets) = 0
    or exists (select 1 from unnest(v_targets) t(id) where not exists (
      select 1 from public.profiles p where p.id = t.id and coalesce(p.status, 'active') <> 'suspended'
    ))) then
    raise exception 'Hãy chọn người nhận đang hoạt động.' using errcode = '22023';
  end if;
  if p_document->>'audience' = 'all' then v_targets := '{}'; end if;
  if p_id is null then
    insert into notification_private.announcements
      (title, body, priority, audience, target_user_ids, image_url, image_path, action_url, action_label, created_by)
    values (btrim(p_document->>'title'), btrim(p_document->>'body'), p_document->>'priority',
      p_document->>'audience', v_targets, v_image, v_path, v_action, v_label, v_uid) returning id into v_id;
  else
    update notification_private.announcements set title = btrim(p_document->>'title'),
      body = btrim(p_document->>'body'), priority = p_document->>'priority',
      audience = p_document->>'audience', target_user_ids = v_targets, image_url = v_image, image_path = v_path,
      action_url = v_action, action_label = v_label, updated_at = now()
    where id = p_id and status = 'draft' returning id into v_id;
    if v_id is null then raise exception 'Chỉ chỉnh sửa được bản nháp.' using errcode = '22023'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function notification_private.inbox(p_limit integer, p_offset integer, p_unread_only boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := notification_private.require_user(); v_items jsonb; v_pending jsonb; v_total bigint; v_unread bigint;
begin
  select count(*) filter (where not coalesce(p_unread_only, false) or r.read_at is null),
    count(*) filter (where r.read_at is null) into v_total, v_unread
    from notification_private.recipients r join notification_private.announcements n on n.id = r.notification_id
    where r.user_id = v_uid and n.status = 'sent';
  select coalesce(jsonb_agg(to_jsonb(item) order by item.sent_at desc, item.id desc), '[]'::jsonb) into v_items from (
    select n.id, n.title, n.body, n.priority, n.image_url, n.image_path, n.action_url, n.action_label, n.sent_at, r.read_at, r.acknowledged_at
    from notification_private.recipients r join notification_private.announcements n on n.id = r.notification_id
    where r.user_id = v_uid and n.status = 'sent' and (not coalesce(p_unread_only, false) or r.read_at is null)
    order by n.sent_at desc, n.id desc limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) item;
  select to_jsonb(item) into v_pending from (
    select n.id, n.title, n.body, n.priority, n.image_url, n.image_path, n.action_url, n.action_label, n.sent_at, r.read_at, r.acknowledged_at
    from notification_private.recipients r join notification_private.announcements n on n.id = r.notification_id
    where r.user_id = v_uid and n.status = 'sent' and n.priority = 'important' and r.acknowledged_at is null
    order by n.sent_at, n.id limit 1
  ) item;
  return jsonb_build_object('items', v_items, 'total_count', v_total, 'unread_count', v_unread, 'pending', v_pending);
end;
$$;

create or replace function notification_private.detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := notification_private.require_user(); v_result jsonb;
begin
  select to_jsonb(item) into v_result from (
    select n.id, n.title, n.body, n.priority, n.image_url, n.image_path, n.action_url, n.action_label, n.sent_at, r.read_at, r.acknowledged_at
    from notification_private.recipients r join notification_private.announcements n on n.id = r.notification_id
    where r.user_id = v_uid and n.id = p_id and n.status = 'sent'
  ) item;
  return v_result;
end;
$$;

-- Separate entry point prevents older servers from silently ignoring image_path.
create or replace function public.admin_notification_save_with_image(p_document jsonb, p_id uuid default null)
returns uuid language sql security invoker set search_path = ''
as $$ select notification_private.save_draft(p_document, p_id); $$;
revoke all on function public.admin_notification_save_with_image(jsonb, uuid) from public, anon;
grant execute on function public.admin_notification_save_with_image(jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
