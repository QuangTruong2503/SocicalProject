import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsageDb, ids, modelCatalogMigration, queryAs } from './fixtures/usageDb.mjs';
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
  await update(db, 'pro', ['gpt-6.1-terra']);
  assert.deepEqual(await access(db, ids.pro), { models: ['gpt-6.1-terra'], allowed: true });
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
  await db.exec(modelCatalogMigration);
  assert.deepEqual((await access(db, ids.free)).models, ['gpt-6-luna']);
});

test('invalid model configuration is rejected; duplicates normalize and empty/missing profiles stay denied', async (t) => {
  const db = await createUsageDb(t);
  for (const [plan, models] of [['business', ALL], [null, ALL], ['pro', null], ['pro', 'gpt-6-luna'], ['pro', ['unknown']], ['pro', ['gpt-6-astra']], ['pro', ['gpt-6.1-sol']], ['pro', [null]], ['pro', [42]]]) {
    await assert.rejects(update(db, plan, models), /không hợp lệ|không được hỗ trợ/);
  }
  await update(db, 'pro', ['gpt-6.2-sol', 'gpt-6.2-sol', 'gpt-6-luna']);
  assert.deepEqual((await access(db, ids.pro)).models, ['gpt-6-luna', 'gpt-6.2-sol']);
  await db.exec(`update public.profiles set plan = 'unknown' where id = '${ids.pro}'`);
  assert.deepEqual(await access(db, ids.pro), { models: [], allowed: false });
  assert.deepEqual(await access(db, ''), { models: [], allowed: false });
});

test('catalog upgrade maps existing grants, preserves disabled plans and seeds the new Standard price bands once', async (t) => {
  const db = await createUsageDb(t, { legacyModels: true, rerun: false });
  await update(db, 'pro', ['gpt-6-luna']);
  await update(db, 'enterprise', ['gpt-6-astra']);
  await db.exec(modelCatalogMigration);
  await db.exec(modelCatalogMigration);
  const { rows: plans } = await db.query('select plan, allowed_models from usage_private.plan_models order by plan');
  assert.deepEqual(Object.fromEntries(plans.map(({ plan, allowed_models: models }) => [plan, models])), {
    admin: ALL, enterprise: ['gpt-6.1-terra'], free: [], pro: ['gpt-6-luna'],
  });
  const { rows: prices } = await db.query(`select model, max_input_tokens, input_usd_per_mtok::float as input, output_usd_per_mtok::float as output
    from usage_private.model_prices where model in ('gpt-6.1-terra', 'gpt-6.2-sol') order by model, max_input_tokens`);
  assert.deepEqual(prices, [
    { model: 'gpt-6.1-terra', max_input_tokens: 272000, input: 1, output: 5 },
    { model: 'gpt-6.1-terra', max_input_tokens: null, input: 2, output: 7.5 },
    { model: 'gpt-6.2-sol', max_input_tokens: 272000, input: 2, output: 10 },
    { model: 'gpt-6.2-sol', max_input_tokens: null, input: 4, output: 15 },
  ]);
  const { rows: [{ count }] } = await db.query("select count(*)::integer as count from usage_private.config_audit where action = 'plan_models.catalog_replace'");
  assert.equal(count, 2);
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
