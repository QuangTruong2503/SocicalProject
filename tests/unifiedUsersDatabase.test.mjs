import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createUsageDb, as, asSuperuser, ids } from './fixtures/usageDb.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = await read('supabase/migrations/20261117034512_unified_user_management.sql');
test('unified user center preserves data, enforces the permission matrix, audits and detects conflicts', async (t) => {
  const db = await createUsageDb(t, { rerun: false });
  await db.exec('create publication supabase_realtime; grant usage on schema auth, public to authenticated, anon;');
  for (const path of ['supabase/migrations/20261017090000_profiles_plan_check.sql',
    'supabase/migrations/20261117024756_user_last_activity.sql', 'supabase_product_links.sql',
    'supabase_product_links_admin.sql', 'supabase/migrations/20261024084036_product_link_companies.sql']) await db.exec(await read(path));
  await as(db, 'authenticated', ids.admin);
  await db.query(`select public.admin_product_link_set_access($1::uuid[],'checker')`, [[ids.pro, ids.suspended]]);
  await db.query(`select public.admin_usage_config_change('user_quota.upsert',$1)`, [JSON.stringify({ user: ids.pro, daily_image_limit: 7, monthly_image_limit: null, unlimited: false, note: 'Giữ nguyên' })]);
  await asSuperuser(db);
  const preserved = async () => (await db.query(`select jsonb_build_object(
    'accounts',(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p),
    'access',(select jsonb_agg(to_jsonb(a) order by user_id) from public.product_link_access a),
    'quotas',(select jsonb_agg(to_jsonb(o) order by user_id) from usage_private.user_quota_overrides o),
    'permission_history',(select count(*) from public.product_link_logs),
    'quota_history',(select count(*) from usage_private.config_audit),
    'usage',(select count(*) from usage_private.ai_usage_requests)) result`)).rows[0].result;
  const before = await preserved();
  const reconcileSql=await read('scripts/userManagementReconcile.sql');
  const beforeReconcile=(await db.exec(reconcileSql)).flatMap((r) => r.rows || []);
  await db.exec(migration);
  await db.exec(migration);
  assert.deepEqual(await preserved(), before);
  assert.deepEqual((await db.exec(reconcileSql)).flatMap((r) => r.rows || []),beforeReconcile);
  const call = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i+1}`).join(',')}) result`, args)).rows[0].result;
  const directory = (filters = {}) => call('admin_user_directory', [JSON.stringify(filters), 50, 0]);
  const detail = (id) => call('admin_user_detail', [id]);
  const snapshot = ({ id, role, status, direct_level, access_updated_at }) => ({ id, role, status, direct_level, access_updated_at });
  const setAccess = (rows, level, note = '') => call('admin_user_set_access', [JSON.stringify(rows.map(snapshot)), level, note]);
  const setQuota = (id, expected, value) => call('admin_user_set_quota', [id, JSON.stringify(expected), JSON.stringify(value)]);
  await as(db, 'authenticated', ids.admin);

  await t.test('shared directory filters effective rights, counts inherited admins once and preserves empty counts', async () => {
    await asSuperuser(db);
    await db.query(`insert into public.product_link_access(user_id,level) values($1,'viewer')`, [ids.admin]);
    await as(db, 'authenticated', ids.admin);
    const all = await directory();
    assert.equal(all.totalCount, 5);
    assert.equal(all.rows.find((row) => row.id === ids.admin).direct_level, 'viewer');
    assert.equal(all.rows.find((row) => row.id === ids.admin).effective_level, 'admin');
    assert.deepEqual((await directory({ level: 'granted' })).rows.map((p) => p.id).sort(), [ids.admin, ids.pro].sort());
    assert.equal((await directory({ level: 'none' })).totalCount, 3);
    assert.equal((await directory({ level: 'checker', status: 'suspended' })).totalCount, 0);
    assert.equal((await directory({ quota: 'override', plan: 'pro' })).rows[0].id, ids.pro);
    assert.equal((await directory({ search: 'không tồn tại' })).totalCount, 0);
    const stats = await call('admin_user_center_stats');
    assert.equal(stats.effective_access, 2);
    assert.equal(stats.direct_access + stats.admin_access, stats.effective_access);
    assert.equal(stats.suspended_with_access, 1);
  });

  await t.test('changes are atomic, preserve logs and detect concurrent edits without silent overwrites', async () => {
    const first = (await directory({ user: ids.pro })).rows[0];
    const result = await setAccess([first], 'editor', 'Nâng quyền dữ liệu');
    assert.equal(result.updated_count, 1);
    await assert.rejects(setAccess([first], 'viewer'), (e) => e.code === '40001');
    const other = (await directory({ user: ids.pro2 })).rows[0];
    await assert.rejects(setAccess([other, first], 'viewer'), (e) => e.code === '40001');
    assert.equal((await detail(ids.pro2)).profile.direct_level, null);
    const history = await call('admin_user_history', [JSON.stringify({ user: ids.pro, kind: 'admin' }), 50, 0]);
    const event = history.rows.find((e) => e.batch_id === result.batch_id);
    assert.equal(event.actor_id, ids.admin);
    assert.equal(event.target_id, ids.pro);
    assert.deepEqual(event.before_value, { level: 'checker' });
    assert.deepEqual(event.after_value, { level: 'editor' });
    assert.equal(event.note, 'Nâng quyền dữ liệu');
    const actorHistory = await call('admin_user_history', [JSON.stringify({ actor: ids.admin, target: ids.pro }), 50, 0]);
    assert.ok(actorHistory.rows.some((e) => e.event_id === event.event_id));
    const admin = (await detail(ids.admin)).profile;
    await assert.rejects(setAccess([admin], null), /kế thừa quyền admin/);
    assert.equal((await detail(ids.admin)).profile.direct_level, 'viewer');
  });

  await t.test('quota inheritance, zero, unlimited, deletion and version conflicts use existing ledger rules', async () => {
    let user = await detail(ids.pro);
    assert.equal(user.quota.override.daily_image_limit, 7);
    assert.equal(user.quota.enforced, false);
    const expected = user.quota.override;
    await setQuota(ids.pro, expected, { daily_image_limit: 0, monthly_image_limit: null, unlimited: false, note: 'Dừng ngày' });
    user = await detail(ids.pro);
    assert.equal(user.quota.effective.daily_limit, 0);
    await assert.rejects(setQuota(ids.pro, expected, null), (e) => e.code === '40001');
    await setQuota(ids.pro, user.quota.override, { daily_image_limit: null, monthly_image_limit: null, unlimited: true });
    user = await detail(ids.pro);
    assert.equal(user.quota.effective.source, 'override_unlimited');
    assert.equal(user.quota.effective.daily_limit, null);
    await setQuota(ids.pro, user.quota.override, null);
    assert.equal((await detail(ids.pro)).quota.override, null);
    await call('admin_usage_config_change', ['plan_quota.upsert', JSON.stringify({ plan: 'pro', daily_image_limit: 13 })]);
    assert.equal((await detail(ids.pro)).quota.effective.daily_limit, 13);
    assert.deepEqual((await detail(ids.pro)).quota.used, { daily: 0, monthly: 0 });
  });

  await t.test('account edits detect conflicts, preserve direct rights on demotion, and batch status audits are atomic', async () => {
    const snapshotAccount=(p) => Object.fromEntries(['role','status','is_verified','plan','credits','direct_level','access_updated_at'].map((k) => [k,p[k] ?? null]));
    const saveAccount=(p,changes) => call('admin_user_update_profile',[p.id,JSON.stringify(snapshotAccount(p)),JSON.stringify(changes)]);
    const free=(await detail(ids.free)).profile;
    await saveAccount(free,{ plan:'enterprise',is_verified:true });
    assert.equal((await detail(ids.free)).profile.effective_level,null,'plan or verification never grants access');
    await assert.rejects(saveAccount(free,{ credits:100 }), (e) => e.code==='40001');
    await assert.rejects(saveAccount((await detail(ids.admin)).profile,{ status:'suspended' }), (e) => e.code==='42501');
    let pro2=(await detail(ids.pro2)).profile;
    await setAccess([pro2],'viewer');
    pro2=(await detail(ids.pro2)).profile;
    await saveAccount(pro2,{ role:'admin' });
    pro2=(await detail(ids.pro2)).profile;
    assert.equal(pro2.effective_level,'admin');
    assert.equal(pro2.direct_level,'viewer');
    await saveAccount(pro2,{ role:'user' });
    assert.equal((await detail(ids.pro2)).profile.effective_level,'viewer');
    const targets=[(await detail(ids.free)).profile,(await detail(ids.pro2)).profile];
    const bulk=await call('admin_user_bulk_status',[JSON.stringify(targets.map((p) => ({ id:p.id,...snapshotAccount(p) }))),'suspended']);
    assert.equal(bulk.updated_count,2);
    const history=await call('admin_user_history',[JSON.stringify({ kind:'admin' }),50,0]);
    assert.equal(history.rows.filter((e) => e.batch_id===bulk.batch_id).length,2);
    const first=(await detail(ids.free)).profile;
    await assert.rejects(call('admin_user_bulk_status',[JSON.stringify([{ id:first.id,...snapshotAccount(first) },{ id:targets[1].id,...snapshotAccount(targets[1]) }]),'active']), (e) => e.code==='40001');
    assert.equal((await detail(ids.free)).profile.status,'suspended','a stale second target rolls back the first target too');
  });

  await t.test('all roles are checked at the database on every request, including an already open session', async () => {
    await db.query(`select public.admin_update_profile($1,p_status=>'active')`,[ids.pro2]);
    const company = '00000000-0000-4000-8000-000000000001';
    await db.query(`select public.product_links_import($1::jsonb,'merge',$2::uuid)`, [JSON.stringify([{ code: 'TEST', links: ['https://test.invalid/img'] }]), company]);
    const itemId = (await db.query('select id from public.product_link_items limit 1')).rows[0].id;
    for (const [level, rank] of [[null, 0], ['viewer', 1], ['checker', 2], ['editor', 3]]) {
      await as(db, 'authenticated', ids.admin);
      const profile = (await detail(ids.pro2)).profile;
      await setAccess([profile], level);
      await as(db, 'authenticated', ids.pro2);
      assert.equal(await call('product_links_level'), rank);
      assert.equal((await db.query('select * from public.product_link_items')).rows.length, rank ? 1 : 0);
      const updated = await db.query('update public.product_link_items set note=$1 where id=$2 returning id', [level, itemId]);
      assert.equal(updated.rows.length, rank >= 2 ? 1 : 0);
      if (rank < 3) await assert.rejects(call('product_links_import', [JSON.stringify([{ code: 'BYPASS', links: [] }]), 'merge', company]), (e) => e.code === '42501');
      await assert.rejects(call('admin_user_detail', [ids.admin]), (e) => e.code === '42501');
      await assert.rejects(db.query(`update public.profiles set role='admin' where id=$1`, [ids.pro2]), (e) => e.code === '42501');
      await assert.rejects(db.query(`insert into public.product_link_access(user_id,level) values($1,'editor')`, [ids.free]), (e) => e.code === '42501');
    }
    await asSuperuser(db);
    await db.query(`update public.profiles set status='suspended' where id=$1`, [ids.pro2]);
    await as(db, 'authenticated', ids.pro2);
    assert.equal(await call('product_links_level'), 0);
    assert.equal((await db.query('update public.product_link_items set note=$1 returning id', ['blocked'])).rows.length, 0);
    await as(db, 'anon');
    await assert.rejects(call('admin_user_directory', ['{}', 50, 0]), (e) => e.code === '42501');
    for (const [name,args] of [
      ['admin_user_center_stats',[]],['admin_user_detail',[ids.pro]],['admin_user_history',['{}',50,0]],
      ['admin_user_set_access',['[]',null,null]],['admin_user_set_quota',[ids.pro,'null','null']],
      ['admin_user_update_profile',[ids.pro,'{}','{}']],['admin_user_bulk_status',['[]','suspended']],
    ]) await assert.rejects(call(name,args),(e) => e.code==='42501');
    await as(db, 'authenticated', ids.admin);
    const work=await db.query(`select action from public.admin_product_link_work_logs(p_limit=>5000)`);
    assert.ok(work.rows.length>0);
    assert.ok(work.rows.every((row) => !['grant','revoke'].includes(row.action)));
    await assert.rejects(db.query('select * from user_admin_private.directory_rows()'),(e) => e.code==='42501');
    await assert.rejects(db.query('select * from user_admin_private.history_rows()'),(e) => e.code==='42501');
    const privileged=await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and (p.proname like 'admin_user_%' or p.proname='admin_product_link_work_logs') and p.prosecdef`);
    assert.ok(privileged.rows.every((r) => r.proname==='admin_user_activity'),'new public RPCs are invokers');
  });
});
