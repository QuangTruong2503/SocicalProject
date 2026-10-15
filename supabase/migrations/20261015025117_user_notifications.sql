-- Prerequisite: supabase_admin_profiles_policies.sql (profiles / is_admin / is_active_user).
-- Keep notification_private OUT of the Data API exposed schemas. Safe to re-run.
begin;
create schema if not exists notification_private;
revoke all on schema notification_private from public, anon;
grant usage on schema notification_private to authenticated;

create table if not exists notification_private.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 10000),
  priority text not null check (priority in ('normal', 'important')),
  audience text not null check (audience in ('all', 'selected')),
  target_user_ids uuid[] not null default '{}',
  image_url text,
  action_url text,
  action_label text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'revoked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  revoked_at timestamptz
);
create table if not exists notification_private.recipients (
  notification_id uuid not null references notification_private.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  acknowledged_at timestamptz,
  primary key (notification_id, user_id)
);
create index if not exists notification_recipients_user_idx
  on notification_private.recipients (user_id, notification_id);
create index if not exists notification_recipients_unread_idx
  on notification_private.recipients (user_id, notification_id) where read_at is null;
create index if not exists notification_announcements_sent_idx
  on notification_private.announcements (sent_at desc, id desc) where status = 'sent';
create index if not exists notification_announcements_created_idx
  on notification_private.announcements (created_at desc, id desc);
create index if not exists notification_announcements_author_idx
  on notification_private.announcements (created_by);
alter table notification_private.announcements enable row level security;
alter table notification_private.recipients enable row level security;
-- No direct client table access, including admins. Checked RPCs are the only entry points.
revoke all on all tables in schema notification_private from public, anon, authenticated;

create or replace function notification_private.require_user(p_admin boolean default false)
returns uuid language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_active_user()
    or (p_admin and not public.is_admin()) then
    raise exception 'Bạn không có quyền thực hiện thao tác này.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- Delivery hints must never prevent a send/read from being committed. Clients also poll.
create or replace function notification_private.signal_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'notifications:' || p_user_id::text, true);
exception when others then
  raise warning 'Notification realtime hint unavailable';
end;
$$;

create or replace function notification_private.save_draft(p_document jsonb, p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := notification_private.require_user(true);
  v_id uuid;
  v_targets uuid[];
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
      (title, body, priority, audience, target_user_ids, image_url, action_url, action_label, created_by)
    values (btrim(p_document->>'title'), btrim(p_document->>'body'), p_document->>'priority',
      p_document->>'audience', v_targets, v_image, v_action, v_label, v_uid) returning id into v_id;
  else
    update notification_private.announcements set title = btrim(p_document->>'title'),
      body = btrim(p_document->>'body'), priority = p_document->>'priority',
      audience = p_document->>'audience', target_user_ids = v_targets, image_url = v_image,
      action_url = v_action, action_label = v_label, updated_at = now()
    where id = p_id and status = 'draft' returning id into v_id;
    if v_id is null then raise exception 'Chỉ chỉnh sửa được bản nháp.' using errcode = '22023'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function notification_private.publish(p_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := notification_private.require_user(true); v_row notification_private.announcements; v_count integer;
begin
  select * into v_row from notification_private.announcements where id = p_id for update;
  if not found or v_row.status = 'revoked' then
    raise exception 'Không thể gửi thông báo này.' using errcode = '22023';
  end if;
  if v_row.status = 'sent' then
    return (select count(*)::integer from notification_private.recipients where notification_id = p_id);
  end if;
  update notification_private.announcements set status = 'sent', sent_at = now(), updated_at = now() where id = p_id;
  insert into notification_private.recipients (notification_id, user_id)
    select p_id, p.id from public.profiles p
    where coalesce(p.status, 'active') <> 'suspended'
      and (v_row.audience = 'all' or p.id = any(v_row.target_user_ids));
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Không có người nhận đang hoạt động.' using errcode = '22023'; end if;
  return v_count;
end;
$$;

create or replace function notification_private.revoke_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := notification_private.require_user(true); v_recipient record;
begin
  update notification_private.announcements set status = 'revoked', revoked_at = now(), updated_at = now()
    where id = p_id and status = 'sent';
  if not found then raise exception 'Chỉ thu hồi được thông báo đã gửi.' using errcode = '22023'; end if;
  for v_recipient in select user_id from notification_private.recipients where notification_id = p_id loop
    perform notification_private.signal_user(v_recipient.user_id);
  end loop;
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
    select n.id, n.title, n.body, n.priority, n.image_url, n.action_url, n.action_label, n.sent_at, r.read_at, r.acknowledged_at
    from notification_private.recipients r join notification_private.announcements n on n.id = r.notification_id
    where r.user_id = v_uid and n.status = 'sent' and (not coalesce(p_unread_only, false) or r.read_at is null)
    order by n.sent_at desc, n.id desc limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) item;
  select to_jsonb(item) into v_pending from (
    select n.id, n.title, n.body, n.priority, n.image_url, n.action_url, n.action_label, n.sent_at, r.read_at, r.acknowledged_at
    from notification_private.recipients r join notification_private.announcements n on n.id = r.notification_id
    where r.user_id = v_uid and n.status = 'sent' and n.priority = 'important' and r.acknowledged_at is null
    order by n.sent_at, n.id limit 1
  ) item;
  return jsonb_build_object('items', v_items, 'total_count', v_total, 'unread_count', v_unread, 'pending', v_pending);
end;
$$;

create or replace function notification_private.mark_read(p_id uuid, p_acknowledge boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := notification_private.require_user();
begin
  update notification_private.recipients r set read_at = coalesce(r.read_at, now()),
    acknowledged_at = case when p_acknowledge and n.priority = 'important' then coalesce(r.acknowledged_at, now()) else r.acknowledged_at end
  from notification_private.announcements n
  where r.notification_id = n.id and r.user_id = v_uid and n.status = 'sent'
    and ((p_id is null and n.priority = 'normal') or n.id = p_id)
    and (r.read_at is null or (p_acknowledge and n.priority = 'important' and r.acknowledged_at is null));
end;
$$;

create or replace function notification_private.detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := notification_private.require_user(); v_result jsonb;
begin
  select to_jsonb(item) into v_result from (
    select n.id, n.title, n.body, n.priority, n.image_url, n.action_url, n.action_label, n.sent_at, r.read_at, r.acknowledged_at
    from notification_private.recipients r join notification_private.announcements n on n.id = r.notification_id
    where r.user_id = v_uid and n.id = p_id and n.status = 'sent'
  ) item;
  return v_result;
end;
$$;

create or replace function notification_private.admin_list(p_limit integer, p_offset integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := notification_private.require_user(true); v_items jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc, item.id desc), '[]'::jsonb) into v_items from (
    select n.*, (select count(*) from notification_private.recipients r where r.notification_id = n.id) as recipient_count,
      (select count(*) from notification_private.recipients r where r.notification_id = n.id and r.read_at is not null) as read_count,
      (select count(*) from notification_private.recipients r where r.notification_id = n.id and r.acknowledged_at is not null) as acknowledged_count
    from notification_private.announcements n order by n.created_at desc, n.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) item;
  return jsonb_build_object('items', v_items, 'total_count', (select count(*) from notification_private.announcements));
end;
$$;

-- Broadcast contains no notification text or user details. Always reload through a checked RPC.
create or replace function notification_private.broadcast_recipient()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform notification_private.signal_user(new.user_id);
  return new;
end;
$$;
drop trigger if exists notification_recipient_changed on notification_private.recipients;
create trigger notification_recipient_changed after insert or update on notification_private.recipients
  for each row execute function notification_private.broadcast_recipient();
drop policy if exists notification_receive_own on realtime.messages;
create policy notification_receive_own on realtime.messages for select to authenticated
  using (extension = 'broadcast' and (select public.is_active_user())
    and (select realtime.topic()) = 'notifications:' || (select auth.uid())::text);

create or replace function public.notification_inbox(p_limit integer default 20, p_offset integer default 0, p_unread_only boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$ select notification_private.inbox(p_limit, p_offset, p_unread_only); $$;
create or replace function public.notification_mark_read(p_id uuid default null, p_acknowledge boolean default false)
returns void language sql security invoker set search_path = '' as $$ select notification_private.mark_read(p_id, p_acknowledge); $$;
create or replace function public.notification_detail(p_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select notification_private.detail(p_id); $$;
create or replace function public.admin_notification_save(p_document jsonb, p_id uuid default null)
returns uuid language sql security invoker set search_path = '' as $$ select notification_private.save_draft(p_document, p_id); $$;
create or replace function public.admin_notification_publish(p_id uuid)
returns integer language sql security invoker set search_path = '' as $$ select notification_private.publish(p_id); $$;
create or replace function public.admin_notification_revoke(p_id uuid)
returns void language sql security invoker set search_path = '' as $$ select notification_private.revoke_announcement(p_id); $$;
create or replace function public.admin_notification_list(p_limit integer default 20, p_offset integer default 0)
returns jsonb language sql security invoker set search_path = '' as $$ select notification_private.admin_list(p_limit, p_offset); $$;

revoke all on all functions in schema notification_private from public, anon, authenticated;
grant execute on function notification_private.inbox(integer, integer, boolean), notification_private.mark_read(uuid, boolean),
  notification_private.detail(uuid),
  notification_private.save_draft(jsonb, uuid), notification_private.publish(uuid), notification_private.revoke_announcement(uuid),
  notification_private.admin_list(integer, integer) to authenticated;
revoke all on function public.notification_inbox(integer, integer, boolean), public.notification_mark_read(uuid, boolean),
  public.notification_detail(uuid),
  public.admin_notification_save(jsonb, uuid), public.admin_notification_publish(uuid), public.admin_notification_revoke(uuid),
  public.admin_notification_list(integer, integer) from public, anon;
grant execute on function public.notification_inbox(integer, integer, boolean), public.notification_mark_read(uuid, boolean),
  public.notification_detail(uuid),
  public.admin_notification_save(jsonb, uuid), public.admin_notification_publish(uuid), public.admin_notification_revoke(uuid),
  public.admin_notification_list(integer, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
