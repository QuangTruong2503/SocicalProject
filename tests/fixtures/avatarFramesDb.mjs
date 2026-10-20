// PGlite stand-ins for Supabase's auth/storage schemas and the existing profiles
// grants, used by the avatar frame database tests.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const ADMIN = '11111111-1111-4111-8111-111111111111';
export const USER = '22222222-2222-4222-8222-222222222222';
export const OTHER = '33333333-3333-4333-8333-333333333333';
export const SUSPENDED = '44444444-4444-4444-8444-444444444444';

export const MIGRATIONS = {
  frames: new URL('../../supabase/migrations/20261020090000_avatar_frames.sql', import.meta.url),
  animated: new URL('../../supabase/migrations/20261021090000_avatar_frames_animated.sql', import.meta.url),
};

export const readMigration = (name) => readFile(MIGRATIONS[name], 'utf8');

export async function createAvatarFramesDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;

    create table public.profiles (
      id uuid primary key, username text, full_name text, avatar_url text,
      role text default 'user', status text default 'active', plan text,
      updated_at timestamptz default now()
    );
    insert into public.profiles (id, username, role, status) values
      ('${ADMIN}', 'admin', 'admin', 'active'), ('${USER}', 'user', 'user', 'active'),
      ('${OTHER}', 'other', 'user', 'active'), ('${SUSPENDED}', 'locked', 'user', 'suspended');
    alter table public.profiles enable row level security;
    -- Same shape as supabase_profiles_auth_sync.sql.
    grant select on public.profiles to authenticated;
    grant update (username, full_name, avatar_url) on public.profiles to authenticated;
    create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
    create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

    create function public.is_admin() returns boolean language sql stable security definer set search_path = public
      as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and coalesce(status, 'active') <> 'suspended') $$;
    create function public.is_active_user() returns boolean language sql stable security definer set search_path = public
      as $$ select auth.uid() is not null and coalesce((select status from public.profiles where id = auth.uid()), 'active') <> 'suspended' $$;
    create policy profiles_select_admin on public.profiles for select to authenticated using (public.is_admin());

    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id bigint generated always as identity primary key, bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
    grant usage on sequence storage.objects_id_seq to authenticated;
  `);

  const login = async (uid, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.exec(`set role ${role}`);
  };
  const asOwner = async (query, args = []) => {
    await db.exec('reset role');
    return (await db.query(query, args)).rows;
  };
  const rpc = async (query, args = []) => (await db.query(query, args)).rows[0]?.result;

  return { db, login, asOwner, rpc };
}
