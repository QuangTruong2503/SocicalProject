alter table public.profiles enable row level security;

grant select on table public.profiles to authenticated;

revoke insert, update on table public.profiles from authenticated;

grant insert (
  id,
  username,
  email,
  full_name,
  avatar_url,
  phone,
  bio,
  date_of_birth,
  gender,
  country,
  city,
  address,
  preferences,
  social_links
) on public.profiles to authenticated;

grant update (
  username,
  email,
  full_name,
  avatar_url,
  phone,
  bio,
  date_of_birth,
  gender,
  country,
  city,
  address,
  preferences,
  social_links
) on public.profiles to authenticated;

do $$
declare
  protected_column text;
begin
  foreach protected_column in array array[
    'role',
    'status',
    'is_verified',
    'plan',
    'credits',
    'last_login_at',
    'created_at',
    'updated_at'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = protected_column
    ) then
      execute format('revoke insert (%I) on public.profiles from authenticated', protected_column);
      execute format('revoke update (%I) on public.profiles from authenticated', protected_column);
    end if;
  end loop;
end $$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
