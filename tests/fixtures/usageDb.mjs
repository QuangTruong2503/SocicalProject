// PGlite database with the project's own auth/profile SQL and the usage
// migrations. Roles mirror Supabase: anon, authenticated, service_role.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const sql = await Promise.all([
  read('../../supabase_profiles_auth_sync.sql'),
  read('../../supabase_admin_profiles_policies.sql'),
  read('../../supabase/migrations/20261017100000_ai_naming_access.sql'),
  read('../../supabase/migrations/20261018090000_usage_ledger.sql'),
  read('../../supabase/migrations/20261018091000_usage_admin.sql'),
  read('../../supabase/migrations/20261019045632_ai_naming_plan_models.sql'),
]);

export const ids = {
  admin: '10000000-0000-4000-8000-000000000001',
  pro: '20000000-0000-4000-8000-000000000001',
  pro2: '20000000-0000-4000-8000-000000000002',
  free: '30000000-0000-4000-8000-000000000001',
  suspended: '30000000-0000-4000-8000-000000000002',
};

export async function createUsageDb(t, { rerun = true } = {}) {
  const db = new PGlite();
  t?.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users(id uuid primary key, last_sign_in_at timestamptz);
    create table public.profiles(
      id uuid primary key, username text, email text, full_name text, avatar_url text, phone text, bio text,
      date_of_birth date, gender text, country text, city text, address text, preferences jsonb, social_links jsonb,
      role text, status text, is_verified boolean, plan text, credits integer,
      last_login_at timestamptz, created_at timestamptz default now(), updated_at timestamptz
    );
    insert into auth.users(id) values ('${ids.admin}'), ('${ids.pro}'), ('${ids.pro2}'), ('${ids.free}'), ('${ids.suspended}');
    insert into public.profiles(id, email, full_name, role, status, plan) values
      ('${ids.admin}', 'admin@example.com', 'Quản trị', 'admin', 'active', 'free'),
      ('${ids.pro}', 'pro@example.com', 'Người Pro', 'user', 'active', 'pro'),
      ('${ids.pro2}', 'pro2@example.com', 'Người Pro 2', 'user', 'active', 'pro'),
      ('${ids.free}', 'free@example.com', 'Người Free', 'user', 'active', 'free'),
      ('${ids.suspended}', 'locked@example.com', 'Bị khóa', 'user', 'suspended', 'pro');
  `);
  for (const part of sql) await db.exec(part);
  if (rerun) for (const part of sql.slice(3)) await db.exec(part); // migrations are re-runnable
  return db;
}

/** Switches the session to a Supabase role; `userId` becomes auth.uid(). */
export async function as(db, role, userId = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || '']);
  await db.exec(`set role ${role}`);
}

export async function asSuperuser(db) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

/**
 * Calls a jsonb RPC as service_role, like the Edge Function through PostgREST.
 * Each call is its own transaction (PGlite runs them one at a time, as the
 * advisory lock in ai_begin does on a real server).
 */
export async function serviceRpc(db, name, payload) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role; select set_config('request.jwt.claim.sub', '', true);");
    const { rows: [row] } = await tx.query(`select public.${name}($1::jsonb) as result`, [JSON.stringify(payload)]);
    return row.result;
  });
}

/** Same, for any SQL as a given role/user, isolated from other callers. */
export async function queryAs(db, role, userId, text, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId || '']);
    return tx.query(text, params);
  });
}

/**
 * Ledger adapter for the Edge Function handler backed by this PGlite DB —
 * the same SQL the PostgREST adapter calls in production.
 */
export function createPgliteLedger(db, { failOn = {} } = {}) {
  const call = async (name, payload) => {
    if (failOn[name]?.(payload)) throw new Error(`simulated ${name} failure`);
    return serviceRpc(db, name, payload);
  };
  return {
    begin: (payload) => call('ai_usage_begin', payload),
    attemptStart: (payload) => call('ai_usage_attempt_start', payload),
    attemptFinish: (payload) => call('ai_usage_attempt_finish', payload),
    finish: (payload) => call('ai_usage_finish', payload),
    recordRejection: (payload) => call('ai_usage_record_rejection', payload),
  };
}
