-- Restricts profiles.plan to free / pro / enterprise (NULL still means free).
-- admin_update_profile rejects other values with a clear message before the
-- constraint is hit, and admin_list_profiles can filter by plan. Safe to re-run.
begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_plan_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_plan_check
      check (plan in ('free', 'pro', 'enterprise'));
  end if;
end $$;

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

  -- Same list as the profiles_plan_check constraint.
  if v_plan is not null and v_plan not in ('free', 'pro', 'enterprise') then
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

-- admin_list_profiles gains a p_plan filter (NULL plan counts as free).
-- Older signature without p_plan; dropped so PostgREST never sees two overloads.
drop function if exists public.admin_list_profiles(text, text, text, boolean, text, boolean, integer, integer);

create or replace function public.admin_list_profiles(
  p_search text default null,
  p_role text default null,
  p_status text default null,
  p_verified boolean default null,
  p_plan text default null,
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
    and (p_plan is null or coalesce(p.plan::text, 'free') = p_plan)
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

revoke execute on function public.admin_list_profiles(text, text, text, boolean, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_list_profiles(text, text, text, boolean, text, text, boolean, integer, integer) to authenticated;

commit;
