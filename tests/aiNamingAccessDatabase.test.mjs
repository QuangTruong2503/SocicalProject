// can_use_ai_naming() against real SQL in PGlite, with the project's own
// is_admin() and profiles column grants. No credentials, no live database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [adminPolicies, authSync, migration] = await Promise.all([
  read('../supabase_admin_profiles_policies.sql'),
  read('../supabase_profiles_auth_sync.sql'),
  read('../supabase/migrations/20261017100000_ai_naming_access.sql'),
]);

const ids = {
  adminFree: '10000000-0000-4000-8000-000000000001',
  adminSuspended: '10000000-0000-4000-8000-000000000002',
  pro: '20000000-0000-4000-8000-000000000001',
  proUpper: '20000000-0000-4000-8000-000000000002',
  enterprise: '20000000-0000-4000-8000-000000000003',
  free: '30000000-0000-4000-8000-000000000001',
  nullPlan: '30000000-0000-4000-8000-000000000002',
  unknownPlan: '30000000-0000-4000-8000-000000000003',
  proSuspended: '30000000-0000-4000-8000-000000000004',
  noProfile: '40000000-0000-4000-8000-000000000001',
};

async function setup(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users(id uuid primary key, last_sign_in_at timestamptz);
    create table public.profiles(
      id uuid primary key, username text, email text, full_name text, avatar_url text, phone text, bio text,
      date_of_birth date, gender text, country text, city text, address text, preferences jsonb, social_links jsonb,
      role text, status text, is_verified boolean, plan text, credits integer,
      last_login_at timestamptz, created_at timestamptz default now(), updated_at timestamptz
    );
    -- No profiles_plan_check here, so an unknown plan value can be stored to prove it is never ranked.
    insert into public.profiles(id, role, status, plan) values
      ('${ids.adminFree}', 'admin', 'active', 'free'),
      ('${ids.adminSuspended}', 'admin', 'suspended', 'enterprise'),
      ('${ids.pro}', 'user', 'active', 'pro'),
      ('${ids.proUpper}', 'user', null, ' PRO '),
      ('${ids.enterprise}', 'user', 'active', 'enterprise'),
      ('${ids.free}', 'user', 'active', 'free'),
      ('${ids.nullPlan}', null, 'active', null),
      ('${ids.unknownPlan}', 'user', 'active', 'business'),
      ('${ids.proSuspended}', 'user', 'suspended', 'pro');
  `);
  await db.exec(authSync);
  await db.exec(adminPolicies);
  await db.exec(migration);
  await db.exec(migration); // re-runnable
  return db;
}

async function asUser(db, id, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(`set role ${role}`);
}

async function canUse(db, id) {
  await asUser(db, id);
  const { rows: [row] } = await db.query('select public.can_use_ai_naming() as allowed');
  return row.allowed;
}

test('admin, or active Pro and above — nobody else', async (t) => {
  const db = await setup(t);
  const expected = {
    adminFree: true, // admin without Pro
    adminSuspended: false, // suspended admin loses admin rights (is_admin)
    pro: true,
    proUpper: true, // stored with spaces/case — normalized, not string-compared
    enterprise: true, // above Pro
    free: false,
    nullPlan: false, // NULL plan = free
    unknownPlan: false, // unknown tiers have no rank
    proSuspended: false, // plan not in effect while the account is suspended
    noProfile: false,
  };
  for (const [name, allowed] of Object.entries(expected)) {
    assert.equal(await canUse(db, ids[name]), allowed, name);
  }
});

test('plan tiers are ranked by list, not by string comparison', async (t) => {
  const db = await setup(t);
  const { rows } = await db.query(`
    select p, public.plan_rank(p) as rank from unnest(array['free', 'pro', 'enterprise', 'Enterprise', '', null, 'zzz', 'business']) as p
  `);
  assert.deepEqual(rows.map((row) => row.rank), [0, 1, 2, 2, 0, 0, null, null]);
  // 'enterprise' < 'pro' as strings; the rank says otherwise.
  assert.ok(rows[2].rank > rows[1].rank);
});

test('anonymous callers cannot execute it; no session means no access', async (t) => {
  const db = await setup(t);
  await asUser(db, '', 'anon');
  await assert.rejects(db.query('select public.can_use_ai_naming()'), /permission denied/);
  assert.equal(await canUse(db, ''), false);
});

test('users cannot grant themselves a plan or the admin role', async (t) => {
  const db = await setup(t);
  await asUser(db, ids.free);
  await assert.rejects(db.exec(`update public.profiles set plan = 'enterprise' where id = '${ids.free}'`), /permission denied/);
  await assert.rejects(db.exec(`update public.profiles set role = 'admin' where id = '${ids.free}'`), /permission denied/);
  await assert.rejects(db.exec(`update public.profiles set status = 'active' where id = '${ids.proSuspended}'`), /permission denied/);
  // Editable profile fields (metadata the user owns) do not affect access.
  await db.exec(`update public.profiles set preferences = '{"plan":"enterprise","role":"admin"}', bio = 'admin pro' where id = '${ids.free}'`);
  assert.equal(await canUse(db, ids.free), false);
});

test('a downgrade or suspension takes effect on the next call (no cache)', async (t) => {
  const db = await setup(t);
  assert.equal(await canUse(db, ids.pro), true);
  await db.exec('reset role');
  await db.exec(`update public.profiles set plan = 'free' where id = '${ids.pro}'`);
  assert.equal(await canUse(db, ids.pro), false);

  assert.equal(await canUse(db, ids.adminFree), true);
  await db.exec('reset role');
  await db.exec(`update public.profiles set status = 'suspended' where id = '${ids.adminFree}'`);
  assert.equal(await canUse(db, ids.adminFree), false);
});
