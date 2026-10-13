-- Admin access to public.profiles for the admin dashboard (/admin/users).
-- Apply in Supabase SQL Editor AFTER supabase_profiles_auth_sync.sql. Safe to re-run.
--
-- Why this is needed: profiles RLS only allows a user to select/update their OWN
-- row (auth.uid() = id), and the role/status/is_verified/plan/credits columns are
-- revoked from `authenticated` entirely. Admins therefore list users and change
-- role/status through the security definer RPCs below, never through direct
-- table writes, so a regular user can never grant themselves the admin role.

-- ─── Helpers ─────────────────────────────────────────────────────────────────

-- An admin who has been suspended loses admin rights everywhere is_admin() is used.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(status, 'active') <> 'suspended'
  );
$$;

-- Signed in and not suspended. Used by RLS policies of login-only features.
create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
    and coalesce((select status from public.profiles where id = auth.uid()), 'active') <> 'suspended';
$$;

grant execute on function public.is_active_user() to authenticated;

-- Let admins read every profile (in addition to the existing "select own" policy).
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
on public.profiles
for select
to authenticated
using (public.is_admin());

-- ─── Audit log ───────────────────────────────────────────────────────────────

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  target_id uuid references auth.users(id) on delete set null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_target_created_idx
on public.admin_audit_log (target_id, created_at desc);

create index if not exists admin_audit_log_created_idx
on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

-- Written only by the security definer RPCs below; admins can read it.
revoke insert, update, delete on table public.admin_audit_log from anon, authenticated;
grant select on table public.admin_audit_log to authenticated;

drop policy if exists "admin_audit_log_select_admin" on public.admin_audit_log;
create policy "admin_audit_log_select_admin"
on public.admin_audit_log
for select
to authenticated
using (public.is_admin());

-- ─── Update one user ─────────────────────────────────────────────────────────

-- Admins change role/status/is_verified/plan/credits through this RPC only.
-- Guards: no self-edit, values validated, at least one active admin always kept.
-- Every effective change is written to admin_audit_log.
create or replace function public.admin_update_profile(
  p_user_id uuid,
  p_role text default null,
  p_status text default null,
  p_is_verified boolean default null,
  p_plan text default null,
  p_credits integer default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.profiles;
  updated_row public.profiles;
  v_plan text := nullif(lower(btrim(coalesce(p_plan, ''))), '');
  v_changes jsonb;
begin
  -- Serialize role/status changes so two admins cannot demote each other at the
  -- same moment and leave the system without any active admin.
  perform pg_advisory_xact_lock(hashtext('public.admin_update_profile'));

  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền thực hiện thao tác này.' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Không thể tự thay đổi vai trò hoặc trạng thái của chính mình.' using errcode = '42501';
  end if;

  if p_role is not null and p_role not in ('user', 'admin') then
    raise exception 'Vai trò không hợp lệ: %', p_role using errcode = '22023';
  end if;

  if p_status is not null and p_status not in ('active', 'suspended') then
    raise exception 'Trạng thái không hợp lệ: %', p_status using errcode = '22023';
  end if;

  if v_plan is not null and v_plan !~ '^[a-z0-9_-]{1,30}$' then
    raise exception 'Gói không hợp lệ: %', p_plan using errcode = '22023';
  end if;

  if p_credits is not null and (p_credits < 0 or p_credits > 1000000) then
    raise exception 'Credits phải nằm trong khoảng 0 – 1.000.000.' using errcode = '22023';
  end if;

  select * into old_row from public.profiles where id = p_user_id for update;

  if not found then
    raise exception 'Không tìm thấy người dùng.' using errcode = 'P0002';
  end if;

  if old_row.role = 'admin'
    and coalesce(old_row.status, 'active') <> 'suspended'
    and ((p_role is not null and p_role <> 'admin') or p_status = 'suspended')
    and not exists (
      select 1 from public.profiles
      where role = 'admin'
        and coalesce(status, 'active') <> 'suspended'
        and id <> p_user_id
    )
  then
    raise exception 'Phải giữ lại ít nhất một quản trị viên đang hoạt động.' using errcode = '42501';
  end if;

  update public.profiles set
    role = coalesce(p_role, role),
    status = coalesce(p_status, status),
    is_verified = coalesce(p_is_verified, is_verified),
    plan = coalesce(v_plan, plan),
    credits = coalesce(p_credits, credits),
    updated_at = now()
  where id = p_user_id
  returning * into updated_row;

  select coalesce(jsonb_object_agg(o.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
  into v_changes
  from jsonb_each(jsonb_build_object(
    'role', old_row.role, 'status', old_row.status, 'is_verified', old_row.is_verified,
    'plan', old_row.plan, 'credits', old_row.credits
  )) o
  join jsonb_each(jsonb_build_object(
    'role', updated_row.role, 'status', updated_row.status, 'is_verified', updated_row.is_verified,
    'plan', updated_row.plan, 'credits', updated_row.credits
  )) n on n.key = o.key
  where o.value is distinct from n.value;

  if v_changes <> '{}'::jsonb then
    insert into public.admin_audit_log (actor_id, actor_email, target_id, action, changes)
    values (
      auth.uid(),
      (select email from public.profiles where id = auth.uid()),
      p_user_id,
      'update_profile',
      v_changes
    );
  end if;

  return updated_row;
end;
$$;

revoke execute on function public.admin_update_profile(uuid, text, text, boolean, text, integer) from public, anon;
grant execute on function public.admin_update_profile(uuid, text, text, boolean, text, integer) to authenticated;

-- ─── Bulk lock / unlock ──────────────────────────────────────────────────────

-- Applies the same guards and audit as admin_update_profile; the caller's own id
-- is skipped. All-or-nothing: one failure rolls the whole batch back.
create or replace function public.admin_bulk_update_status(
  p_user_ids uuid[],
  p_status text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền thực hiện thao tác này.' using errcode = '42501';
  end if;

  if coalesce(array_length(p_user_ids, 1), 0) > 500 then
    raise exception 'Chỉ cập nhật tối đa 500 người dùng mỗi lần.' using errcode = '22023';
  end if;

  foreach v_id in array coalesce(p_user_ids, '{}'::uuid[])
  loop
    continue when v_id = auth.uid();
    perform public.admin_update_profile(v_id, null, p_status);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.admin_bulk_update_status(uuid[], text) from public, anon;
grant execute on function public.admin_bulk_update_status(uuid[], text) to authenticated;

-- ─── List users (server-side search, filter, sort, paging) ──────────────────

-- Returns only the columns the admin table needs (no phone/address/dob…).
-- total_count is the number of matches before limit/offset.
create or replace function public.admin_list_profiles(
  p_search text default null,
  p_role text default null,
  p_status text default null,
  p_verified boolean default null,
  p_sort text default 'created_at',
  p_desc boolean default true,
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
  is_verified boolean,
  plan text,
  credits integer,
  last_login_at timestamptz,
  created_at timestamptz,
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
  v_sort text := case
    when p_sort in ('created_at', 'last_login_at', 'name', 'email') then p_sort
    else 'created_at'
  end;
  v_desc boolean := coalesce(p_desc, true);
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới xem được danh sách người dùng.' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.username::text,
    p.email::text,
    p.full_name::text,
    p.avatar_url::text,
    coalesce(p.role::text, 'user'),
    coalesce(p.status::text, 'active'),
    coalesce(p.is_verified, false),
    p.plan::text,
    p.credits::integer,
    p.last_login_at::timestamptz,
    p.created_at::timestamptz,
    count(*) over ()::bigint
  from public.profiles p
  where (v_search is null
      or position(v_search in lower(concat_ws(' ', p.username, p.email, p.full_name, p.id::text))) > 0)
    and (p_role is null or coalesce(p.role::text, 'user') = p_role)
    and (p_status is null or coalesce(p.status::text, 'active') = p_status)
    and (p_verified is null or coalesce(p.is_verified, false) = p_verified)
  order by
    case when v_sort = 'created_at' and v_desc then p.created_at end desc nulls last,
    case when v_sort = 'created_at' and not v_desc then p.created_at end asc nulls last,
    case when v_sort = 'last_login_at' and v_desc then p.last_login_at end desc nulls last,
    case when v_sort = 'last_login_at' and not v_desc then p.last_login_at end asc nulls last,
    case when v_sort = 'name' and v_desc then lower(coalesce(nullif(btrim(p.full_name), ''), p.username, p.email)) end desc nulls last,
    case when v_sort = 'name' and not v_desc then lower(coalesce(nullif(btrim(p.full_name), ''), p.username, p.email)) end asc nulls last,
    case when v_sort = 'email' and v_desc then lower(p.email) end desc nulls last,
    case when v_sort = 'email' and not v_desc then lower(p.email) end asc nulls last,
    p.created_at desc,
    p.id
  limit least(greatest(coalesce(p_limit, 50), 1), 5000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_list_profiles(text, text, text, boolean, text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_list_profiles(text, text, text, boolean, text, boolean, integer, integer) to authenticated;

-- ─── Summary tiles ───────────────────────────────────────────────────────────

create or replace function public.admin_profile_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới xem được thống kê người dùng.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'admins', count(*) filter (where p.role = 'admin' and coalesce(p.status, 'active') <> 'suspended'),
    'suspended', count(*) filter (where p.status = 'suspended'),
    'verified', count(*) filter (where coalesce(p.is_verified, false)),
    'new_7d', count(*) filter (where p.created_at >= now() - interval '7 days'),
    'active_7d', count(*) filter (where p.last_login_at >= now() - interval '7 days')
  )
  into v_result
  from public.profiles p;

  return v_result;
end;
$$;

revoke execute on function public.admin_profile_stats() from public, anon;
grant execute on function public.admin_profile_stats() to authenticated;

-- ─── Per-user activity for the detail panel ──────────────────────────────────

-- Each feature table is optional (checked with to_regclass) so this works even
-- when a module's SQL has not been applied.
create or replace function public.admin_user_activity(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_part jsonb;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới xem được hoạt động người dùng.' using errcode = '42501';
  end if;

  if to_regclass('public.watermark_image_counts') is not null then
    execute $q$
      select jsonb_build_object(
        'watermark_images', coalesce(sum(image_count), 0),
        'watermark_entries', count(*),
        'watermark_last_at', max(created_at)
      )
      from public.watermark_image_counts where user_id = $1
    $q$ into v_part using p_user_id;
    v_result := v_result || v_part;
  end if;

  if to_regclass('public.quotations') is not null then
    execute $q$
      select jsonb_build_object(
        'quotations', count(*),
        'quotations_last_at', max(created_at)
      )
      from public.quotations where prepared_by = $1 and deleted_at is null
    $q$ into v_part using p_user_id;
    v_result := v_result || v_part;
  end if;

  if to_regclass('public.product_link_access') is not null then
    execute $q$
      select jsonb_build_object('product_links_level', (
        select level from public.product_link_access where user_id = $1
      ))
    $q$ into v_part using p_user_id;
    v_result := v_result || v_part;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.admin_user_activity(uuid) from public, anon;
grant execute on function public.admin_user_activity(uuid) to authenticated;

-- ─── Keep profiles.last_login_at in sync with Supabase Auth ──────────────────

create or replace function public.sync_profile_last_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.profiles set last_login_at = new.last_sign_in_at where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_signed_in on auth.users;
create trigger on_auth_user_signed_in
after update of last_sign_in_at on auth.users
for each row execute function public.sync_profile_last_login();

-- One-time backfill for users who signed in before the trigger existed.
update public.profiles p
set last_login_at = u.last_sign_in_at
from auth.users u
where u.id = p.id
  and u.last_sign_in_at is not null
  and p.last_login_at is distinct from u.last_sign_in_at;

-- One-time bootstrap: promote your own account to admin, then remove/comment this out.
-- update public.profiles set role = 'admin' where email = 'your-account@example.com';
