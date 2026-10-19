import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createUsageDb, ids, queryAs } from './fixtures/usageDb.mjs';
import { IMAGE_NAME_MODELS } from '../supabase/functions/suggest-image-names/imageNaming.js';

const ALL = IMAGE_NAME_MODELS.map(({ id }) => id);
const update = (db, plan, models, user = ids.admin) => queryAs(db, 'authenticated', user,
  "select public.admin_usage_config_change('plan_models.update', $1::jsonb) as r",
  [JSON.stringify({ plan, allowed_models: models })]);
async function access(db, user) {
  return (await queryAs(db, 'authenticated', user,
    'select public.ai_naming_models() as models, public.can_use_ai_naming() as allowed')).rows[0];
}

test('plan permissions default to existing access; admin changes apply immediately, exactly per plan and are audited', async (t) => {
  const db = await createUsageDb(t);
  assert.deepEqual(await access(db, ids.pro), { models: ALL, allowed: true });
  assert.deepEqual(await access(db, ids.admin), { models: ALL, allowed: true });
  assert.deepEqual(await access(db, ids.free), { models: [], allowed: false });
  assert.deepEqual(await access(db, ids.suspended), { models: [], allowed: false });
  await update(db, 'pro', ['gpt-6.1-sol']);
  assert.deepEqual(await access(db, ids.pro), { models: ['gpt-6.1-sol'], allowed: true });
  await db.exec(`update public.profiles set plan = 'enterprise' where id = '${ids.pro2}'`);
  assert.deepEqual((await access(db, ids.pro2)).models, ALL, 'Enterprise does not inherit Pro restrictions');
  await update(db, 'free', ['gpt-6-luna']);
  assert.deepEqual(await access(db, ids.free), { models: ['gpt-6-luna'], allowed: true });
  await update(db, 'pro', []);
  assert.deepEqual(await access(db, ids.pro), { models: [], allowed: false });
  await update(db, 'admin', []);
  assert.deepEqual(await access(db, ids.admin), { models: [], allowed: false });
  const { rows: [{ r: config }] } = await queryAs(db, 'authenticated', ids.admin, 'select public.admin_usage_config() as r');
  assert.equal(config.plan_models.length, 4, 'admin can still configure access when its AI is disabled');
  assert.equal(config.audit.filter((row) => row.action === 'plan_models.update').length, 4);
  const change = config.audit.find((row) => row.target === 'plan:free');
  assert.equal(change.actor_id, ids.admin);
  assert.deepEqual(change.before_value, { allowed_models: [] });
  assert.deepEqual(change.after_value, { allowed_models: ['gpt-6-luna'] });
  // Re-applying the migration must never reset an admin's saved selections.
  await db.exec(await readFile(new URL('../supabase/migrations/20261019045632_ai_naming_plan_models.sql', import.meta.url), 'utf8'));
  assert.deepEqual((await access(db, ids.free)).models, ['gpt-6-luna']);
});

test('invalid model configuration is rejected; duplicates normalize and empty/missing profiles stay denied', async (t) => {
  const db = await createUsageDb(t);
  for (const [plan, models] of [['business', ALL], [null, ALL], ['pro', null], ['pro', 'gpt-6-luna'], ['pro', ['unknown']], ['pro', [null]], ['pro', [42]]]) {
    await assert.rejects(update(db, plan, models), /không hợp lệ|không được hỗ trợ/);
  }
  await update(db, 'pro', ['gpt-6-astra', 'gpt-6-astra', 'gpt-6-luna']);
  assert.deepEqual((await access(db, ids.pro)).models, ['gpt-6-luna', 'gpt-6-astra']);
  await db.exec(`update public.profiles set plan = 'unknown' where id = '${ids.pro}'`);
  assert.deepEqual(await access(db, ids.pro), { models: [], allowed: false });
  assert.deepEqual(await access(db, ''), { models: [], allowed: false });
});

test('only active admins can edit, clients cannot bypass RPCs or spoof identity, public wrappers are invokers', async (t) => {
  const db = await createUsageDb(t);
  for (const user of [ids.pro, ids.free, ids.suspended]) {
    await assert.rejects(update(db, 'pro', ALL, user), /Chỉ quản trị viên/);
    await assert.rejects(queryAs(db, 'authenticated', user, 'select usage_private.admin_config_with_models()'), /Chỉ quản trị viên/);
  }
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(queryAs(db, role, ids.admin, 'select * from usage_private.plan_models'), /permission denied/);
    await assert.rejects(queryAs(db, role, ids.admin, "update usage_private.plan_models set allowed_models = '{}'"), /permission denied/);
  }
  await assert.rejects(queryAs(db, 'anon', '', 'select public.ai_naming_models()'), /permission denied/);
  await assert.rejects(queryAs(db, 'authenticated', ids.free, "update public.profiles set plan = 'enterprise' where id = auth.uid()"), /permission denied/);
  await db.exec(`update public.profiles set preferences = '{"role":"admin","plan":"enterprise"}' where id = '${ids.free}'`);
  assert.deepEqual((await access(db, ids.free)).models, []);
  await db.exec(`update public.profiles set status = 'suspended' where id = '${ids.admin}'`);
  await assert.rejects(update(db, 'pro', ALL), /Chỉ quản trị viên/);
  assert.deepEqual((await access(db, ids.admin)).models, []);
  const { rows } = await db.query("select proname, prosecdef from pg_proc where oid in ('public.ai_naming_models()'::regprocedure, 'public.can_use_ai_naming()'::regprocedure, 'public.admin_usage_config()'::regprocedure, 'public.admin_usage_config_change(text,jsonb)'::regprocedure)");
  assert.ok(rows.every((row) => row.prosecdef === false));
});
