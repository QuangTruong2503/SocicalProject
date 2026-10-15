import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const STAFF = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const migration = await readFile(new URL('../supabase/migrations/20261015044005_admin_quotations_management.sql',import.meta.url),'utf8');

test('admin quotation SQL integrates with existing schemas and RPCs', async (t) => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table public.profiles(id uuid primary key, role text, status text, full_name text, username text, email text);
    insert into auth.users values ('${ADMIN}'),('${STAFF}'),('${OTHER}');
    insert into public.profiles values ('${ADMIN}','admin','active','Admin','admin','admin@test.invalid'),
      ('${STAFF}','user','active','Staff','staff','staff@test.invalid'),('${OTHER}','user','active','Other','other','other@test.invalid');
    create function public.is_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active') $$;
    create function public.is_active_user() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='active') $$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  `);
  for (const name of ['supabase_quotation_management.sql','supabase_quotation_v2.sql','supabase_knm_quotations.sql','supabase_knm_quotations_v2.sql']) {
    await db.exec(await readFile(new URL(`../${name}`,import.meta.url),'utf8'));
  }
  await db.exec(migration); await db.exec(migration);
  await db.exec(`
    insert into public.quotations(quotation_no,quotation_date,customer_name,phone,total,prepared_by,prepared_by_name,status) values
      ('BG-20261015-0001',date_trunc('month',now())::date,'Alpha','0901.234.567',100,'${STAFF}','Staff','draft'),
      ('BG-20261015-0002',date_trunc('month',now())::date,'Beta',null,50,'${OTHER}','Other','cancelled'),
      ('BG-20261015-0003',(date_trunc('month',now())+interval '2 months')::date,'Future',null,300,'${STAFF}','Staff','confirmed');
    insert into public.quotation_items(quotation_id,position,product_name,quantity,unit,unit_price)
      select id,1,'Product',2,'Cái',50 from public.quotations where status='draft';
    insert into public.knm_quotations(quotation_no,customer_name,total,created_by,created_by_name,quotation) values
      ('BG-20261015-001','KNM Alpha',90,'${STAFF}','Staff','{"items":[{"description":"Product","quantity":2,"unitPrice":45}]}'),
      ('BG-20261015-002','KNM Beta',200,'${OTHER}','Other','{}');
  `);
  const login = async (uid,role='authenticated') => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]); await db.exec(`set role ${role}`); };
  const rpc = async (query,args=[]) => (await db.query(query,args)).rows[0].result;
  const list = (kind='standard',search=null,status=null,from=null,to=null,creator=null,trash=false,sort='created_at',desc=true,limit=25,offset=0) => rpc('select public.admin_list_quotations($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result',[kind,search,status,from,to,creator,trash,sort,desc,limit,offset]);
  const detail = (kind,id) => rpc('select public.admin_get_quotation($1,$2) as result',[kind,id]);
  const change = (kind,row,action,status=null,expected=row.updated_at) => rpc('select public.admin_change_quotation($1,$2,$3,$4,$5) as result',[kind,row.id,action,expected,status]);
  const code = (fn,expected) => assert.rejects(fn,(error) => error.code===expected);

  await t.test('anonymous and ordinary staff cannot use public or private admin RPCs', async () => {
    await login('','anon'); await code(() => list(),'42501');
    await login(STAFF); await code(() => list(),'42501');
    await code(() => rpc("select quotation_admin_private.get_quotation('knm',gen_random_uuid()) as result"),'42501');
  });
  await login(ADMIN);
  let standard; let knm;
  await t.test('pagination keeps exact counts even on an empty page; summaries exclude cancelled values', async () => {
    const result = await list('standard',null,null,null,null,null,false,'total',true,1);
    assert.equal(result.total_count,3); assert.equal(result.rows.length,1);
    assert.equal(result.rows[0].customer_name,'Future');
    assert.equal(result.summary.value,400); assert.equal(result.summary.month,2);
    assert.equal(result.creators.length,2);
    const empty = await list('standard',null,null,null,null,null,false,'created_at',true,25,500);
    assert.equal(empty.rows.length,0); assert.equal(empty.total_count,3);
    standard = (await list('standard',null,'draft')).rows[0];
    knm = (await list('knm')).rows[0];
  });
  await t.test('phone formatting, creator, status and date filters are evaluated on the server', async () => {
    assert.equal((await list('standard','0901234567')).total_count,1);
    assert.equal((await list('standard',null,null,null,null,STAFF)).total_count,2);
    assert.equal((await list('standard',null,'draft')).total_count,1);
    assert.equal((await list('knm','KNM Alpha')).total_count,1);
    await code(() => list('standard',null,null,'2026-10-15','2026-10-01'),'22023');
    await code(() => list('knm',null,'draft'),'22023');
    await code(() => list('invalid'),'22023');
  });
  await t.test('stale destructive actions are rejected and non-drafts cannot be deleted', async () => {
    await code(() => change('standard',standard,'delete',null,'2000-01-01T00:00:00Z'),'40001');
    await code(() => change('standard',standard,'delete',null,null),'40001');
    const confirmed = (await list('standard',null,'confirmed')).rows[0];
    await code(() => change('standard',confirmed,'delete'),'22023');
    await change('standard',standard,'status','sent');
    await code(() => change('standard',standard,'status','cancelled'),'40001');
    standard = (await list('standard',standard.quotation_no)).rows[0];
    await change('standard',standard,'status','draft');
    standard = (await list('standard',standard.quotation_no)).rows[0];
  });
  await t.test('soft delete and restore preserve identifiers, content and audit both types', async () => {
    for (const [kind,row] of [['standard',standard],['knm',knm]]) {
      await change(kind,row,'delete');
      assert.equal((await list(kind,row.quotation_no)).total_count,0);
      const trash = await list(kind,row.quotation_no,null,null,null,null,true);
      assert.equal(trash.total_count,1);
      const deleted = trash.rows[0];
      const loaded = await detail(kind,row.id);
      assert.ok(loaded.record.deleted_at);
      assert.equal(loaded.history[0].action,'delete');
      await login(STAFF);
      const table = kind === 'standard' ? 'quotations' : 'knm_quotations';
      const audit = kind === 'standard' ? 'quotation_audit_log' : 'knm_quotation_audit_log';
      assert.equal((await db.query(`select id from public.${table} where id=$1`,[row.id])).rows.length,0);
      assert.equal((await db.query(`select id from public.${audit} where quotation_id=$1`,[row.id])).rows.length,0);
      if (kind === 'standard') assert.equal((await db.query('select id from public.quotation_items where quotation_id=$1',[row.id])).rows.length,0);
      await code(() => detail(kind,row.id),'42501');
      await login(ADMIN);
      await change(kind,deleted,'restore');
      const restored = (await list(kind,row.quotation_no)).rows[0];
      assert.equal(restored.id,row.id); assert.equal(restored.total,row.total);
      assert.equal(restored.customer_name,row.customer_name); assert.equal(restored.deleted_at,null);
      if (kind === 'standard') assert.equal((await detail(kind,row.id)).record.quotation_items.length,1);
      assert.equal((await detail(kind,row.id)).history[0].action,'restore');
      await code(() => change(kind,deleted,'restore'),'40001');
    }
  });
  await t.test('wrong kind cannot mutate a quotation in the other table', async () => {
    const current = (await list('standard',standard.quotation_no)).rows[0];
    await code(() => change('knm',current,'delete'),'P0002');
    const freshKnm = (await list('knm',knm.quotation_no)).rows[0];
    await code(() => change('knm',freshKnm,'status','sent'),'22023');
  });
  await t.test('suspended admins lose access to list, detail and writes', async () => {
    await db.exec('reset role'); await db.query("update profiles set status='suspended' where id=$1",[ADMIN]); await login(ADMIN);
    await code(() => list(),'42501'); await code(() => detail('standard',standard.id),'42501');
    await code(() => change('standard',standard,'delete'),'42501');
  });
});
