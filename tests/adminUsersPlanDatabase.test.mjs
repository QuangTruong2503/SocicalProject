import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const migration = await readFile(new URL('../supabase/migrations/20261017090000_profiles_plan_check.sql', import.meta.url), 'utf8');

test('profiles.plan is limited to free/pro/enterprise and admin_update_profile enforces it', async (t) => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.profiles(
      id uuid primary key, username text, email text, full_name text, avatar_url text, role text, status text,
      is_verified boolean, plan text, credits integer, last_login_at timestamptz, created_at timestamptz default now(),
      updated_at timestamptz
    );
    -- The pre-plan-filter signature that the migration must replace.
    create function public.admin_list_profiles(text, text, text, boolean, text, boolean, integer, integer)
      returns setof public.profiles language sql as $$ select * from public.profiles $$;
    create table public.admin_audit_log(
      id bigint generated always as identity primary key, actor_id uuid, actor_email text,
      target_id uuid, action text, changes jsonb, created_at timestamptz default now()
    );
    insert into public.profiles(id, email, role, status, is_verified, plan, credits, updated_at) values
      ('${ADMIN}','admin@test.invalid','admin','active',true,'pro',0,now()),
      ('${USER}','user@test.invalid','user','active',false,null,0,now());
    create function public.is_admin() returns boolean language sql stable security definer as $$
      select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active') $$;
  `);
  await db.exec(migration); await db.exec(migration);

  await assert.rejects(
    db.exec(`update public.profiles set plan='business' where id='${USER}'`),
    /profiles_plan_check/,
  );

  const { rows: overloads } = await db.query(`select 1 from pg_proc where proname = 'admin_list_profiles'`);
  assert.equal(overloads.length, 1);

  await db.exec(`select set_config('request.jwt.claim.sub','${ADMIN}',false)`);

  const listIds = async (plan) => (await db.query(
    `select id from public.admin_list_profiles(p_plan => $1) order by email`, [plan],
  )).rows.map((row) => row.id);
  assert.deepEqual(await listIds(null), [ADMIN, USER]);
  assert.deepEqual(await listIds('free'), [USER]); // NULL plan counts as free
  assert.deepEqual(await listIds('pro'), [ADMIN]);
  assert.deepEqual(await listIds('enterprise'), []);

  await assert.rejects(
    db.query(`select public.admin_update_profile($1, p_plan => 'business')`, [USER]),
    /Gói không hợp lệ: business/,
  );

  await db.query(`select public.admin_update_profile($1, p_plan => ' Enterprise ')`, [USER]);
  const { rows: [row] } = await db.query(`select plan from public.profiles where id=$1`, [USER]);
  assert.equal(row.plan, 'enterprise');

  const { rows: [audit] } = await db.query(`select changes from public.admin_audit_log where target_id=$1`, [USER]);
  assert.deepEqual(audit.changes, { plan: { from: null, to: 'enterprise' } });
  assert.deepEqual(await listIds('enterprise'), [USER]);
});
