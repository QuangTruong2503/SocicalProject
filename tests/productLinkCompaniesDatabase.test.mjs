import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const STAFF = '22222222-2222-4222-8222-222222222222';
const MT = '00000000-0000-4000-8000-000000000001';
const TAM = '00000000-0000-4000-8000-000000000002';
const baseline = await readFile(new URL('../supabase_product_links.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261024084036_product_link_companies.sql', import.meta.url), 'utf8');

test('company migration preserves products, scopes imports and enforces company management permissions', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated;
    create table public.profiles(id uuid primary key, role text, status text, full_name text, username text, email text);
    insert into public.profiles(id,role,status,full_name) values
      ('${ADMIN}','admin','active','Admin'), ('${STAFF}','user','active','Nhân viên');
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active')
    $$;
    create publication supabase_realtime;
  `);
  await db.exec(baseline);
  const login = async (uid, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await db.exec(`set role ${role}`);
  };
  const rejects = (request, code) => assert.rejects(request, (error) => error.code === code);
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const imp = async (company, mode, links = ['https://image.test/new']) => (await rows(
    'select public.product_links_import($1::jsonb,$2,$3::uuid) result',
    [JSON.stringify([{ code: 'SKU-1', links }]), mode, company],
  ))[0].result;

  await login(ADMIN);
  await db.query("insert into public.product_link_items(code,links,note,is_done) values('SKU-1',array['https://image.test/old'],'Ghi chú cũ',true)");
  const legacy = (await rows('select * from public.product_link_items'))[0];
  await db.exec('reset role');
  await db.exec(migration);

  await t.test('legacy rows and log history retain their values and belong to Minh Triết', async () => {
    const item = (await rows('select * from public.product_link_items'))[0];
    assert.equal(item.company_id, MT);
    for (const key of Object.keys(legacy)) assert.deepEqual(item[key], legacy[key], key);
    assert.equal((await rows('select company_id from public.product_link_logs'))[0].company_id, MT);
    assert.deepEqual((await rows('select name from public.product_link_companies order by created_at')).map((r) => r.name), ['Minh Triết', 'Minh Tâm']);
  });

  await login(ADMIN);
  await db.query("insert into public.product_link_access(user_id,level) values($1,'editor')", [STAFF]);
  await t.test('only active admins can create companies; duplicate and empty names are rejected', async () => {
    await login(STAFF);
    assert.equal((await rows('select * from public.product_link_companies')).length, 2);
    await rejects(() => db.query("insert into public.product_link_companies(name) values('Không được phép')"), '42501');
    await login(ADMIN);
    await db.query("insert into public.product_link_companies(name) values('Công ty mới')");
    await rejects(() => db.query("insert into public.product_link_companies(name) values('minh tâm')"), '23505');
    await rejects(() => db.query("insert into public.product_link_companies(name) values('')"), '23514');
    await rejects(() => db.query("insert into public.product_link_companies(name) values(' Minh Tâm ' )"), '23514');
  });

  await t.test('the same product code is valid in different companies and imports stay scoped', async () => {
    await login(STAFF);
    assert.equal((await imp(TAM, 'merge')).created, 1);
    assert.equal((await imp(TAM, 'merge', ['https://image.test/extra'])).updated, 1);
    assert.equal((await imp(TAM, 'skip', ['https://image.test/skipped'])).skipped, 1);
    assert.equal((await imp(TAM, 'replace', ['https://image.test/replaced'])).updated, 1);
    const items = await rows('select * from public.product_link_items order by company_id');
    assert.equal(items.length, 2);
    assert.deepEqual(items[0].links, legacy.links);
    assert.equal(items[0].is_done, true);
    assert.deepEqual(items[1].links, ['https://image.test/replaced']);
    assert.equal(items[1].is_done, false);
    await rejects(() => db.query('insert into public.product_link_items(company_id,code) values($1,$2)', [TAM, 'sku-1']), '23505');
    await rejects(() => db.query('update public.product_link_items set company_id=$1 where id=$2', [TAM, legacy.id]), '42501');
    await rejects(() => imp(null, 'merge'), '22023');
    await rejects(() => imp('00000000-0000-4000-8000-000000000099', 'merge'), '22023');
    const imports = await rows("select company_id,details from public.product_link_logs where action='import'");
    assert.ok(imports.every((r) => r.company_id === TAM && r.details.company_id === TAM));
  });

  await t.test('copy and item audit logs retain the correct company, including deleted products', async () => {
    const item = (await rows('select * from public.product_link_items where company_id=$1', [TAM]))[0];
    await db.query("insert into public.product_link_logs(user_id,action,item_id,item_code,company_id) values($1,'copy',$2,$3,$4)", [STAFF, item.id, item.code, TAM]);
    await rejects(() => db.query("insert into public.product_link_logs(user_id,action,item_id,company_id) values($1,'copy',$2,$3)", [STAFF, item.id, MT]), '42501');
    await db.query('update public.product_link_items set is_pinned=true where id=$1', [item.id]);
    await db.query('update public.product_link_items set is_done=true where id=$1', [item.id]);
    await db.query('delete from public.product_link_items where id=$1', [item.id]);
    const logs = await rows('select company_id,action from public.product_link_logs where item_id=$1 order by id', [item.id]);
    assert.ok(logs.every((r) => r.company_id === TAM));
    assert.deepEqual(logs.map((r) => r.action), ['copy', 'pin', 'check', 'delete']);
  });

  await t.test('viewer, revoked, anonymous and suspended admin permissions cannot be bypassed', async () => {
    await login(ADMIN);
    await db.query("update public.product_link_access set level='viewer' where user_id=$1", [STAFF]);
    await login(STAFF);
    await rejects(() => imp(TAM, 'merge'), '42501');
    await rejects(() => db.query("insert into public.product_link_items(company_id,code) values($1,'VIEWER')", [TAM]), '42501');
    await login(ADMIN);
    await db.query('delete from public.product_link_access where user_id=$1', [STAFF]);
    await login(STAFF);
    assert.equal((await rows('select * from public.product_link_companies')).length, 0);
    await login('', 'anon');
    await rejects(() => db.query('select * from public.product_link_companies'), '42501');
    await rejects(() => imp(TAM, 'merge'), '42501');
    await db.exec('reset role');
    await db.query("update public.profiles set status='suspended' where id=$1", [ADMIN]);
    await login(ADMIN);
    await rejects(() => db.query("insert into public.product_link_companies(name) values('Suspended')"), '42501');
  });

  await t.test('migration is repeatable and legacy two-argument imports remain compatible', async () => {
    await db.exec('reset role');
    await db.query("update public.profiles set status='active' where id=$1", [ADMIN]);
    const snapshot = await rows('select * from public.product_link_items');
    await db.exec(migration);
    assert.deepEqual(await rows('select * from public.product_link_items'), snapshot);
    await login(ADMIN);
    const result = (await rows("select public.product_links_import('[{\"code\":\"LEGACY\",\"links\":[]}]','merge') result"))[0].result;
    assert.equal(result.created, 1);
    assert.equal(result.company_id, MT);
    const functions = await rows("select n.nspname,p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('import_items','product_links_import')");
    assert.ok(functions.every((r) => r.nspname === 'product_links_private' || !r.prosecdef));
  });
});
