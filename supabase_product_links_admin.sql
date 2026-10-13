-- Admin tools for "Link ảnh sản phẩm" (/admin/product-links). Safe to re-run.
-- Run AFTER supabase_product_links.sql and supabase_admin_profiles_policies.sql.
--
-- Adds: server-set granted_by/timestamps, admin RPCs (access list, bulk grant,
-- stats, filtered logs, actor list), search indexes, and a 14-day retention
-- for "copy" log entries (scheduled automatically when pg_cron is enabled).

-- ─── Access rows: granted_by / timestamps always come from the server ───────

create or replace function public.product_link_access_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null only when run from the SQL editor; keep the given value then.
  new.granted_by := coalesce(auth.uid(), new.granted_by);
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists product_link_access_before_write on public.product_link_access;
create trigger product_link_access_before_write
before insert or update on public.product_link_access
for each row execute function public.product_link_access_before_write();

-- ─── Admin: users with their product-link access ────────────────────────────
-- p_level: null = all, 'granted' = admin or any level, 'none' = no access,
--          'viewer' | 'checker' | 'editor' | 'admin'.
-- p_sort:  'name' | 'level' | 'updated_at'. total_count is before limit/offset.
create or replace function public.admin_product_link_access_list(
  p_search text default null,
  p_level text default null,
  p_status text default null,
  p_sort text default 'name',
  p_desc boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  email text,
  full_name text,
  avatar_url text,
  role text,
  status text,
  level text,
  granted_by uuid,
  granted_by_name text,
  access_updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_level text := nullif(btrim(coalesce(p_level, '')), '');
  v_sort text := case when p_sort in ('name', 'level', 'updated_at') then p_sort else 'name' end;
  v_desc boolean := coalesce(p_desc, false);
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới xem được phân quyền.' using errcode = '42501';
  end if;

  return query
  with base as (
    select
      p.id as u_id,
      p.username::text as u_username,
      p.email::text as u_email,
      p.full_name::text as u_full_name,
      p.avatar_url::text as u_avatar_url,
      coalesce(p.role::text, 'user') as u_role,
      coalesce(p.status::text, 'active') as u_status,
      a.level as u_level,
      a.granted_by as u_granted_by,
      coalesce(nullif(btrim(g.full_name), ''), nullif(btrim(g.username), ''), g.email)::text as u_granted_by_name,
      a.updated_at as u_updated_at,
      case when coalesce(p.role::text, 'user') = 'admin' then 4
           when a.level = 'editor' then 3 when a.level = 'checker' then 2 when a.level = 'viewer' then 1
           else 0 end as u_rank,
      lower(coalesce(nullif(btrim(p.full_name), ''), p.username, p.email)) as u_sort_name
    from public.profiles p
    left join public.product_link_access a on a.user_id = p.id
    left join public.profiles g on g.id = a.granted_by
  )
  select
    b.u_id, b.u_username, b.u_email, b.u_full_name, b.u_avatar_url, b.u_role, b.u_status,
    b.u_level, b.u_granted_by, b.u_granted_by_name, b.u_updated_at,
    count(*) over ()::bigint
  from base b
  where (v_search is null
      or position(v_search in lower(concat_ws(' ', b.u_username, b.u_email, b.u_full_name, b.u_id::text))) > 0)
    and (p_status is null or p_status = '' or b.u_status = p_status)
    and (
      v_level is null
      or (v_level = 'granted' and b.u_rank > 0)
      or (v_level = 'none' and b.u_rank = 0)
      or (v_level = 'admin' and b.u_role = 'admin')
      or (v_level in ('viewer', 'checker', 'editor') and b.u_role <> 'admin' and b.u_level = v_level)
    )
  order by
    case when v_sort = 'level' and v_desc then b.u_rank end desc,
    case when v_sort = 'level' and not v_desc then b.u_rank end asc,
    case when v_sort = 'updated_at' and v_desc then b.u_updated_at end desc nulls last,
    case when v_sort = 'updated_at' and not v_desc then b.u_updated_at end asc nulls last,
    case when v_sort = 'name' and v_desc then b.u_sort_name end desc nulls last,
    case when v_sort = 'name' and not v_desc then b.u_sort_name end asc nulls last,
    b.u_sort_name,
    b.u_id
  limit least(greatest(coalesce(p_limit, 50), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_product_link_access_list(text, text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_product_link_access_list(text, text, text, text, boolean, integer, integer) to authenticated;

-- ─── Admin: grant / change / revoke for one or many users ───────────────────
-- p_level '' or null revokes. Admin accounts are skipped (they always have full
-- access). Grant/revoke log entries come from the existing product_link_access_log trigger.
create or replace function public.admin_product_link_set_access(
  p_user_ids uuid[],
  p_level text
)
returns table (
  user_id uuid,
  level text,
  granted_by uuid,
  granted_by_name text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_level text := nullif(btrim(coalesce(p_level, '')), '');
  v_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được phân quyền.' using errcode = '42501';
  end if;

  if v_level is not null and v_level not in ('viewer', 'checker', 'editor') then
    raise exception 'Quyền không hợp lệ: %', p_level using errcode = '22023';
  end if;

  if coalesce(array_length(p_user_ids, 1), 0) = 0 then
    raise exception 'Chưa chọn người dùng nào.' using errcode = '22023';
  end if;

  if array_length(p_user_ids, 1) > 500 then
    raise exception 'Chỉ phân quyền tối đa 500 người dùng mỗi lần.' using errcode = '22023';
  end if;

  select coalesce(array_agg(p.id), '{}'::uuid[])
  into v_ids
  from public.profiles p
  where p.id = any(p_user_ids)
    and coalesce(p.role::text, 'user') <> 'admin';

  if v_level is null then
    delete from public.product_link_access a where a.user_id = any(v_ids);
  else
    insert into public.product_link_access as a (user_id, level)
    select unnest(v_ids), v_level
    on conflict on constraint product_link_access_pkey
    do update set level = excluded.level
    where a.level is distinct from excluded.level;
  end if;

  return query
  select
    t.id,
    a.level,
    a.granted_by,
    coalesce(nullif(btrim(g.full_name), ''), nullif(btrim(g.username), ''), g.email)::text,
    a.updated_at
  from unnest(v_ids) as t(id)
  left join public.product_link_access a on a.user_id = t.id
  left join public.profiles g on g.id = a.granted_by;
end;
$$;

revoke execute on function public.admin_product_link_set_access(uuid[], text) from public, anon;
grant execute on function public.admin_product_link_set_access(uuid[], text) to authenticated;

-- ─── Admin: summary tiles ───────────────────────────────────────────────────

create or replace function public.admin_product_link_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_items jsonb;
  v_access jsonb;
  v_logs jsonb;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới xem được thống kê.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'items_total', count(*),
    'items_done', count(*) filter (where i.is_done),
    'items_pinned', count(*) filter (where i.is_pinned and not i.is_done)
  )
  into v_items
  from public.product_link_items i;

  select jsonb_build_object(
    'viewer', count(*) filter (where a.level = 'viewer' and coalesce(p.role, 'user') <> 'admin'),
    'checker', count(*) filter (where a.level = 'checker' and coalesce(p.role, 'user') <> 'admin'),
    'editor', count(*) filter (where a.level = 'editor' and coalesce(p.role, 'user') <> 'admin'),
    'suspended_with_access', count(*) filter (where p.status = 'suspended' and coalesce(p.role, 'user') <> 'admin')
  )
  into v_access
  from public.product_link_access a
  join public.profiles p on p.id = a.user_id;

  select jsonb_build_object(
    'actions_7d', count(*) filter (where l.action <> 'copy'),
    'copies_7d', count(*) filter (where l.action = 'copy'),
    'active_users_7d', count(distinct l.user_id)
  )
  into v_logs
  from public.product_link_logs l
  where l.created_at >= now() - interval '7 days';

  return v_items || v_access || v_logs || jsonb_build_object(
    'admins', (select count(*) from public.profiles where role = 'admin' and coalesce(status, 'active') <> 'suspended'),
    'copy_retention_days', 14
  );
end;
$$;

revoke execute on function public.admin_product_link_stats() from public, anon;
grant execute on function public.admin_product_link_stats() to authenticated;

-- ─── Admin: activity log with filters (keyset paging on id) ─────────────────
-- Search matches the product code, the actor and, for grant/revoke entries,
-- the user whose access changed. % and _ are matched literally.
create or replace function public.admin_product_link_logs(
  p_search text default null,
  p_action text default null,
  p_user_id uuid default null,
  p_from timestamptz default null,
  p_hide_copy boolean default false,
  p_before_id bigint default null,
  p_limit integer default 50
)
returns setof public.product_link_logs
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_pattern text;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới xem được nhật ký.' using errcode = '42501';
  end if;

  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select l.*
  from public.product_link_logs l
  where (p_before_id is null or l.id < p_before_id)
    and (p_action is null or p_action = '' or l.action = p_action)
    and (p_user_id is null or l.user_id = p_user_id)
    and (p_from is null or l.created_at >= p_from)
    and (not coalesce(p_hide_copy, false) or l.action <> 'copy')
    and (
      v_pattern is null
      or l.item_code ilike v_pattern
      or l.actor_name ilike v_pattern
      or (l.details ->> 'target_name') ilike v_pattern
    )
  order by l.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 5000);
end;
$$;

revoke execute on function public.admin_product_link_logs(text, text, uuid, timestamptz, boolean, bigint, integer) from public, anon;
grant execute on function public.admin_product_link_logs(text, text, uuid, timestamptz, boolean, bigint, integer) to authenticated;

-- People who did something in the last 90 days, for the "Người thực hiện" filter.
create or replace function public.admin_product_link_log_actors()
returns table (user_id uuid, actor_name text, last_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới xem được nhật ký.' using errcode = '42501';
  end if;

  return query
  select x.user_id, x.actor_name, x.created_at
  from (
    select distinct on (l.user_id) l.user_id, l.actor_name, l.created_at
    from public.product_link_logs l
    where l.user_id is not null
      and l.created_at >= now() - interval '90 days'
    order by l.user_id, l.created_at desc
  ) x
  order by x.created_at desc;
end;
$$;

revoke execute on function public.admin_product_link_log_actors() from public, anon;
grant execute on function public.admin_product_link_log_actors() to authenticated;

-- ─── Indexes for the log filters and search ─────────────────────────────────

create index if not exists product_link_logs_action_id_idx
on public.product_link_logs (action, id desc);

create index if not exists product_link_logs_copy_created_idx
on public.product_link_logs (created_at)
where action = 'copy';

-- Trigram indexes make "contains" searches (ilike '%…%') fast. Skipped with a
-- notice if pg_trgm cannot be installed.
do $$
declare
  v_schema text;
begin
  begin
    create extension if not exists pg_trgm with schema extensions;
  exception when others then
    begin
      create extension if not exists pg_trgm;
    exception when others then
      raise notice 'pg_trgm không khả dụng, bỏ qua index tìm kiếm: %', sqlerrm;
    end;
  end;

  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if v_schema is null then
    return;
  end if;

  execute format('create index if not exists product_link_logs_item_code_trgm_idx on public.product_link_logs using gin (item_code %I.gin_trgm_ops)', v_schema);
  execute format('create index if not exists product_link_logs_actor_name_trgm_idx on public.product_link_logs using gin (actor_name %I.gin_trgm_ops)', v_schema);
  execute format('create index if not exists product_link_logs_target_name_trgm_idx on public.product_link_logs using gin ((details ->> ''target_name'') %I.gin_trgm_ops)', v_schema);
end;
$$;

-- ─── Retention: "copy" entries are kept for 14 days ─────────────────────────

-- Internal: callable only by the database owner (pg_cron) and the admin wrapper below.
create or replace function public.product_link_logs_purge_copy(p_keep_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.product_link_logs
  where action = 'copy'
    and created_at < now() - make_interval(days => greatest(coalesce(p_keep_days, 14), 1));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.product_link_logs_purge_copy(integer) from public, anon, authenticated;

create or replace function public.admin_product_link_purge_copy_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới được dọn nhật ký.' using errcode = '42501';
  end if;

  return public.product_link_logs_purge_copy(14);
end;
$$;

revoke execute on function public.admin_product_link_purge_copy_logs() from public, anon;
grant execute on function public.admin_product_link_purge_copy_logs() to authenticated;

-- Daily at 03:00 Vietnam time (20:00 UTC). Requires the pg_cron extension
-- (Supabase Dashboard → Integrations → Cron). Without it, use the
-- "Dọn log copy cũ" button in /admin/product-links.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'product-link-copy-log-retention',
      '0 20 * * *',
      'select public.product_link_logs_purge_copy(14)'
    );
  else
    raise notice 'pg_cron chưa bật: log "copy" sẽ không tự dọn. Bật Cron rồi chạy lại file này.';
  end if;
end;
$$;
