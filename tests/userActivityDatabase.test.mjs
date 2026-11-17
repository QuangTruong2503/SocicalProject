import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const planMigration = await readFile(new URL('../supabase/migrations/20261017090000_profiles_plan_check.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261117024756_user_last_activity.sql', import.meta.url), 'utf8');

test('activity migration enforces server timestamps, permissions, throttling and admin sorting', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    set timezone = 'UTC';
    create role anon; create role authenticated;
    create schema auth;
    grant usage on schema auth, public to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.profiles (
      id uuid primary key, username text, email text, full_name text, avatar_url text,
      role text, status text, is_verified boolean, plan text, credits integer,
      last_login_at timestamptz, created_at timestamptz default now(), updated_at timestamptz
    );
    create table public.admin_audit_log (
      id bigint generated always as identity primary key, actor_id uuid, actor_email text,
      target_id uuid, action text, changes jsonb, created_at timestamptz default now()
    );
    insert into public.profiles(id, email, role, status, plan, last_login_at) values
      ('${ADMIN}', 'admin@test.invalid', 'admin', 'active', 'pro', '2026-01-01'),
      ('${USER}', 'user@test.invalid', 'user', 'active', null, '2026-01-02'),
      ('${OTHER}', 'other@test.invalid', 'user', 'active', 'enterprise', '2026-01-03');
    create function public.is_admin() returns boolean language sql stable security definer as $$
      select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active') $$;
    alter table public.profiles enable row level security;
    grant select on public.profiles to authenticated;
    grant insert (id, username, email), update (username, email) on public.profiles to authenticated;
    create policy profiles_select on public.profiles for select to authenticated
      using (id = (select auth.uid()) or public.is_admin());
    create policy profiles_update on public.profiles for update to authenticated
      using (id = (select auth.uid())) with check (id = (select auth.uid()));
  `);
  await db.exec(planMigration);
  await db.exec(migration);
  await db.exec(migration); // Deployment retry must be safe.

  async function signIn(id, role = 'authenticated') {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? '']);
    await db.exec(`set role ${role}`);
  }
  const stamp = async (id) => (await db.query('select last_active_at from public.profiles where id=$1', [id])).rows[0]?.last_active_at;

  await t.test('no historical activity is invented; anonymous access is denied', async () => {
    assert.equal(await stamp(USER), null);
    await signIn(null, 'anon');
    await assert.rejects(db.query('select public.record_user_activity()'), /permission denied/);
    await assert.rejects(db.query('select * from public.admin_list_profiles()'), /permission denied/);
    await signIn(null);
    await assert.rejects(db.query('select public.record_user_activity()'), /Bạn cần đăng nhập/);
  });

  await t.test('users only record their own activity with server time and cannot forge it', async () => {
    await signIn(USER);
    const before = Date.now();
    await db.query('select public.record_user_activity()');
    const recorded = await stamp(USER);
    assert.ok(recorded.getTime() >= before && recorded.getTime() <= Date.now());
    assert.equal((await db.query('select last_login_at from public.profiles where id=$1', [USER])).rows[0].last_login_at.toISOString(), '2026-01-02T00:00:00.000Z');
    await assert.rejects(db.query(`update public.profiles set last_active_at='2099-01-01' where id=$1`, [USER]), /permission denied/);
    await assert.rejects(db.query(`insert into public.profiles (id, last_active_at) values ($1, now())`, [OTHER]), /permission denied/);
    await assert.rejects(db.query('select * from public.admin_list_profiles()'), /Chỉ quản trị viên/);
    await assert.rejects(db.query('select * from user_activity_private.admin_list_profiles()'), /Chỉ quản trị viên/);
    await db.exec('reset role');
    assert.equal(await stamp(OTHER), null);
    assert.equal(await stamp(ADMIN), null);
  });

  await t.test('the database throttles repeated calls and rejects suspended activity', async () => {
    await signIn(USER);
    const first = await stamp(USER);
    await db.query('select public.record_user_activity()');
    assert.deepEqual(await stamp(USER), first);
    await db.exec('reset role');
    await db.query(`update public.profiles set last_active_at=now()-interval '2 minutes' where id=$1`, [USER]);
    const old = await stamp(USER);
    await signIn(USER);
    await db.query('select public.record_user_activity()');
    assert.ok((await stamp(USER)) > old);
    await db.exec('reset role');
    await db.query(`update public.profiles set status='suspended', last_active_at=null where id=$1`, [OTHER]);
    await signIn(OTHER);
    await db.query('select public.record_user_activity()');
    assert.equal(await stamp(OTHER), null);
  });

  await t.test('admins sort both ways, keep missing timestamps last and preserve filters/paging', async () => {
    await db.exec('reset role');
    await db.query(`update public.profiles set last_active_at='2026-01-01' where id=$1`, [ADMIN]);
    await signIn(ADMIN);
    const list = async (desc) => (await db.query(`select id, last_active_at, total_count from public.admin_list_profiles(p_sort=>'last_active_at', p_desc=>$1)`, [desc])).rows;
    assert.deepEqual((await list(true)).map((row) => row.id), [USER, ADMIN, OTHER]);
    assert.deepEqual((await list(false)).map((row) => row.id), [ADMIN, USER, OTHER]);
    const { rows: filtered } = await db.query(`select id, total_count from public.admin_list_profiles(p_plan=>'free', p_sort=>'last_active_at')`);
    assert.deepEqual(filtered.map((row) => row.id), [USER]);
    assert.equal(filtered[0].total_count, 1);
    const { rows: page } = await db.query(`select id, total_count from public.admin_list_profiles(p_sort=>'last_active_at', p_limit=>1, p_offset=>1)`);
    assert.equal(page[0].id, ADMIN);
    assert.equal(page[0].total_count, 3);
    await db.query(`select public.admin_update_profile($1, p_plan=>'pro')`, [USER]);
    assert.ok(await stamp(USER), 'admin edits preserve activity');
    const { rows: functions } = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('record_user_activity','admin_list_profiles') and p.prosecdef`);
    assert.deepEqual(functions, [], 'new exposed RPCs use invoker security');
  });
});
