-- Admin access to public.profiles for the new admin dashboard.
-- Apply in Supabase SQL Editor AFTER supabase_profiles_auth_sync.sql.
--
-- Why this is needed: profiles RLS currently only allows a user to select/update
-- their OWN row (auth.uid() = id), and the role/status/is_verified/plan/credits
-- columns are revoked from `authenticated` entirely. An admin dashboard needs to
-- (a) list every profile and (b) change another user's role/status. This file adds
-- that access without letting a regular user grant themselves the admin role.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Let admins read every profile (in addition to the existing "select own" policy).
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
on public.profiles
for select
to authenticated
using (public.is_admin());

-- Admins change role/status/is_verified/plan/credits through this RPC only,
-- never through a direct table UPDATE, so column grants never need to be
-- reopened to `authenticated` (which would let a user edit their own role).
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
  updated_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền thực hiện thao tác này.' using errcode = '42501';
  end if;

  update public.profiles set
    role = coalesce(p_role, role),
    status = coalesce(p_status, status),
    is_verified = coalesce(p_is_verified, is_verified),
    plan = coalesce(p_plan, plan),
    credits = coalesce(p_credits, credits),
    updated_at = now()
  where id = p_user_id
  returning * into updated_row;

  return updated_row;
end;
$$;

grant execute on function public.admin_update_profile(uuid, text, text, boolean, text, integer) to authenticated;

-- One-time bootstrap: promote your own account to admin, then remove/comment this out.
-- update public.profiles set role = 'admin' where email = 'your-account@example.com';
