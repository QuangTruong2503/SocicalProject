-- Access rule for "Đặt tên AI" on /watermark: admins, or active accounts whose
-- plan ranks at or above Pro. Requires public.is_admin()
-- (supabase_admin_profiles_policies.sql) and profiles.plan
-- (20261017090000_profiles_plan_check.sql). Safe to re-run.
--
-- Data source: public.profiles.role / status / plan. Those columns are not
-- writable by `authenticated` (supabase_profiles_auth_sync.sql) and change only
-- through admin_update_profile, so users cannot grant themselves access.
-- The project has no plan expiry / subscription data: a plan stays in effect
-- until an admin changes it. If expiry is added later, extend can_use_ai_naming()
-- only — the Edge Function and the page both call it.
begin;

-- Plan tiers in ascending order. Keep in sync with profiles_plan_check and
-- PLAN_OPTIONS (src/utils/userProfile.js). Unknown plans have no rank (NULL).
create or replace function public.plan_rank(p_plan text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case coalesce(nullif(lower(btrim(p_plan)), ''), 'free')
    when 'free' then 0
    when 'pro' then 1
    when 'enterprise' then 2
  end;
$$;

-- For the caller (auth.uid() from the verified JWT). Returns only a boolean, so
-- it does not expose other profile data.
create or replace function public.can_use_ai_naming()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.status, 'active') <> 'suspended'
        and coalesce(public.plan_rank(p.plan) >= public.plan_rank('pro'), false)
    );
$$;

revoke execute on function public.can_use_ai_naming() from public, anon;
grant execute on function public.can_use_ai_naming() to authenticated;

commit;
