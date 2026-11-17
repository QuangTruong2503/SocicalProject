-- Apply after the profiles/admin setup and profiles_plan_check migration.
-- Activity starts when this feature is deployed; historical logins are not activity.
begin;

alter table public.profiles add column if not exists last_active_at timestamptz;
comment on column public.profiles.last_active_at is
  'Last visible-page visit or interaction, recorded using server time, at most once per minute.';
revoke insert (last_active_at), update (last_active_at) on public.profiles from public, anon, authenticated;

-- Keep privileged implementations outside the exposed public schema.
create schema if not exists user_activity_private;
revoke all on schema user_activity_private from public, anon, authenticated;
grant usage on schema user_activity_private to authenticated;

create or replace function user_activity_private.record_user_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để ghi nhận hoạt động.' using errcode = '42501';
  end if;

  update public.profiles
  set last_active_at = v_now
  where id = v_uid
    and coalesce(status, 'active') <> 'suspended'
    and (last_active_at is null or last_active_at <= v_now - interval '1 minute');
end;
$$;
revoke all on function user_activity_private.record_user_activity() from public, anon;
grant execute on function user_activity_private.record_user_activity() to authenticated;

create or replace function public.record_user_activity()
returns void
language sql
security invoker
set search_path = ''
as $$ select user_activity_private.record_user_activity(); $$;
revoke all on function public.record_user_activity() from public, anon;
grant execute on function public.record_user_activity() to authenticated;

-- A new return column requires replacing the public function. Keep every
-- existing filter, pagination and sort behavior, and add last_active_at sorting.
drop function if exists public.admin_list_profiles(text, text, text, boolean, text, boolean, integer, integer);
drop function if exists public.admin_list_profiles(text, text, text, boolean, text, text, boolean, integer, integer);

create or replace function user_activity_private.admin_list_profiles(
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
  last_active_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_sort text := case
    when p_sort in ('created_at', 'last_login_at', 'last_active_at', 'name', 'email') then p_sort
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
    p.last_active_at::timestamptz,
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
    case when v_sort = 'last_active_at' and v_desc then p.last_active_at end desc nulls last,
    case when v_sort = 'last_active_at' and not v_desc then p.last_active_at end asc nulls last,
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
revoke all on function user_activity_private.admin_list_profiles(text, text, text, boolean, text, text, boolean, integer, integer) from public, anon;
grant execute on function user_activity_private.admin_list_profiles(text, text, text, boolean, text, text, boolean, integer, integer) to authenticated;

create function public.admin_list_profiles(
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
  last_active_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from user_activity_private.admin_list_profiles(
    p_search, p_role, p_status, p_verified, p_plan, p_sort, p_desc, p_limit, p_offset
  );
$$;
revoke all on function public.admin_list_profiles(text, text, text, boolean, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_list_profiles(text, text, text, boolean, text, text, boolean, integer, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
