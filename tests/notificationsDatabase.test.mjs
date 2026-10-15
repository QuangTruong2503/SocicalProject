import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../supabase/migrations/20261015025117_user_notifications.sql', import.meta.url), 'utf8');
const storageSql = await readFile(new URL('../supabase/migrations/20261015040836_notification_image_storage.sql', import.meta.url), 'utf8');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const SUSPENDED = '44444444-4444-4444-8444-444444444444';
const draft = (overrides = {}) => ({ title: 'Thông báo', body: 'Nội dung\nDòng tiếp theo', priority: 'normal', audience: 'all', target_user_ids: [], image_url: '', action_url: '', action_label: '', ...overrides });

test('notifications: SQL permissions, recipient snapshots, modal acknowledgements and revocation', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text references storage.buckets(id), name text, primary key(bucket_id, name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    grant select on storage.objects to anon;
    create schema auth; create table auth.users (id uuid primary key);
    create table public.profiles (id uuid primary key references auth.users(id), role text, status text);
    insert into auth.users values ('${ADMIN}'), ('${A}'), ('${B}'), ('${SUSPENDED}');
    insert into public.profiles values ('${ADMIN}', 'admin', 'active'), ('${A}', 'user', 'active'), ('${B}', 'user', 'active'), ('${SUSPENDED}', 'user', 'suspended');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.is_active_user() returns boolean language sql stable security definer as $$
      select exists(select 1 from public.profiles where id = auth.uid() and status = 'active') $$;
    create function public.is_admin() returns boolean language sql stable security definer as $$
      select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active') $$;
    grant usage on schema auth to authenticated;
    create schema realtime;
    create table realtime.messages (topic text, extension text, payload jsonb, private boolean);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated;
    grant select on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('test.topic', true) $$;
    create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language sql as $$
      insert into realtime.messages values (topic, 'broadcast', payload, private) $$;
  `);
  await db.exec(sql);
  await db.exec(sql);
  await db.exec(storageSql);
  await db.exec(storageSql);
  const asUser = async (id, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.exec(`set role ${role}`);
  };
  const rpc = async (query, args = []) => (await db.query(`select ${query} as result`, args)).rows[0].result;
  const save = (doc, id = null) => rpc(`public.${doc.image_path ? 'admin_notification_save_with_image' : 'admin_notification_save'}($1::jsonb, $2::uuid)`, [JSON.stringify(doc), id]);
  const inbox = (limit = 20, offset = 0, unread = false) => rpc('public.notification_inbox($1, $2, $3)', [limit, offset, unread]);
  const denied = (fn) => assert.rejects(fn, (error) => error.code === '42501');

  await t.test('anonymous and ordinary users cannot write or access private tables', async () => {
    await asUser('', 'anon');
    await denied(() => inbox());
    await asUser(A);
    await denied(() => save(draft()));
    await denied(() => rpc('public.admin_notification_publish(gen_random_uuid())'));
    await denied(() => rpc('public.admin_notification_revoke(gen_random_uuid())'));
    await denied(() => rpc('public.admin_notification_list()'));
    await denied(() => db.query('select * from notification_private.recipients'));
    await denied(() => db.query("insert into notification_private.announcements(title) values ('fake')"));
    await asUser(SUSPENDED);
    await denied(() => inbox());
  });

  let normal; let important; let selected;
  await t.test('drafts remain private; publish is idempotent and excludes suspended users', async () => {
    await asUser(ADMIN);
    normal = await save(draft());
    await asUser(A); assert.equal((await inbox()).items.length, 0);
    await asUser(ADMIN);
    assert.equal(await rpc('public.admin_notification_publish($1)', [normal]), 3);
    assert.equal(await rpc('public.admin_notification_publish($1)', [normal]), 3);
    await assert.rejects(() => save(draft({ title: 'changed' }), normal), (error) => error.code === '22023');
    important = await save(draft({ priority: 'important', title: 'Quan trọng' }));
    await rpc('public.admin_notification_publish($1)', [important]);
    selected = await save(draft({ audience: 'selected', target_user_ids: [A, A], title: 'Riêng A' }));
    assert.equal(await rpc('public.admin_notification_publish($1)', [selected]), 1);
    await asUser(A); assert.equal((await inbox()).items.length, 3);
    await asUser(B); assert.equal((await inbox()).items.length, 2);
    assert.equal(await rpc('public.notification_detail($1)', [selected]), null);
  });
  await t.test('bulk read never acknowledges important notifications; acknowledgement is account-specific', async () => {
    await asUser(A);
    assert.equal((await inbox()).pending.id, important);
    await rpc('public.notification_mark_read()');
    let state = await inbox(1, 100, true);
    assert.equal(state.items.length, 0);
    assert.equal(state.total_count, 1);
    assert.equal(state.unread_count, 1);
    assert.equal(state.pending.id, important); // Pending lookup is independent of pagination.
    await rpc('public.notification_mark_read($1, false)', [important]);
    state = await inbox(); assert.equal(state.pending.id, important);
    assert.equal(state.unread_count, 0);
    await rpc('public.notification_mark_read($1, true)', [important]);
    assert.equal((await inbox()).pending, null);
    await rpc('public.notification_mark_read($1, true)', [important]); // Idempotent.
    await asUser(B); assert.equal((await inbox()).pending.id, important);
    await rpc('public.notification_mark_read($1, true)', [selected]);
    await asUser(A);
    assert.equal((await inbox()).items.find((item) => item.id === selected).acknowledged_at, null);
  });
  await t.test('recipient set is frozen when sending; permissions use current database state', async () => {
    await asUser(ADMIN);
    const stats = await rpc('public.admin_notification_list()');
    const row = stats.items.find((item) => item.id === important);
    assert.equal(row.recipient_count, 3); assert.equal(row.acknowledged_count, 1); assert.equal(row.read_count, 1);
    await db.exec('reset role');
    const later = '55555555-5555-4555-8555-555555555555';
    await db.query('insert into auth.users values ($1)', [later]);
    await db.query("insert into public.profiles values ($1, 'user', 'active')", [later]);
    await asUser(later); assert.equal((await inbox()).items.length, 0);
    await asUser(ADMIN);
    await db.exec('reset role');
    await db.query("update public.profiles set status = 'suspended' where id = $1", [ADMIN]);
    await asUser(ADMIN); await denied(() => rpc('public.admin_notification_list()'));
    await db.exec('reset role');
    await db.query("update public.profiles set status = 'active' where id = $1", [ADMIN]);
  });
  await t.test('revoke removes notifications and pending modals from every recipient', async () => {
    await asUser(ADMIN); await rpc('public.admin_notification_revoke($1)', [important]);
    await asUser(B); const state = await inbox();
    assert.equal(state.pending, null); assert.equal(state.items.some((item) => item.id === important), false);
    assert.equal(await rpc('public.notification_detail($1)', [important]), null);
    await asUser(ADMIN);
    const stats = await rpc('public.admin_notification_list()');
    assert.equal(stats.items.find((item) => item.id === important).acknowledged_count, 1);
  });
  await t.test('URL validation rejects active schemes, network paths and backslash redirects', async () => {
    await asUser(ADMIN);
    for (const action_url of ['javascript:alert(1)', '//evil.example', '/\\evil.example', 'data:text/html,test', 'http://example.com']) {
      await assert.rejects(() => save(draft({ action_url, action_label: 'Open' })), (error) => error.code === '22023');
    }
    await assert.rejects(() => save(draft({ audience: 'selected', target_user_ids: [SUSPENDED] })), (error) => error.code === '22023');
    await save(draft({ action_url: '/notifications', action_label: 'Mở', image_url: 'https://example.com/a.png' }));
    await save(draft({ action_url: 'https://example.com/path', action_label: 'Mở' }));
  });
  await t.test('broadcast authorization restricts each authenticated user to their own topic', async () => {
    await asUser(A);
    await db.query("select set_config('test.topic', $1, false)", [`notifications:${B}`]);
    assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
    await db.query("select set_config('test.topic', $1, false)", [`notifications:${A}`]);
    const messages = (await db.query('select * from realtime.messages')).rows;
    assert.ok(messages.length > 0);
    assert.ok(messages.every((item) => item.private && Object.keys(item.payload).length === 0));
  });
  await t.test('private images enforce admin uploads, recipient reads, immutable sent files and safe cleanup', async () => {
    const path = `${ADMIN}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
    const replacement = `${ADMIN}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`;
    const upload = (name) => db.query("insert into storage.objects values ('notification-images', $1)", [name]);
    const read = () => db.query("select name from storage.objects where bucket_id = 'notification-images'");
    const remove = (name) => db.query("delete from storage.objects where bucket_id = 'notification-images' and name = $1 returning name", [name]);
    await asUser(A);
    await denied(() => upload(path));
    await denied(() => save(draft({ image_path: path })));
    await asUser(ADMIN); await upload(path); await upload(replacement);
    await denied(() => upload(`${A}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`));
    await assert.rejects(() => save(draft({ image_path: `${ADMIN}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png` })), (error) => error.code === '22023');
    const doc = draft({ image_path: path, priority: 'important', audience: 'selected', target_user_ids: [A] });
    const id = await save(doc);
    assert.equal((await remove(path)).rows.length, 0); // Still attached to a draft.
    await asUser(A); assert.equal((await read()).rows.length, 0);
    await asUser(ADMIN); await rpc('public.admin_notification_publish($1)', [id]);
    assert.equal((await db.query("update storage.objects set name = 'changed' where name = $1 returning name", [path])).rows.length, 0);
    await asUser(A);
    assert.deepEqual((await read()).rows.map((row) => row.name), [path]);
    assert.equal((await inbox()).pending.image_path, path);
    assert.equal((await rpc('public.notification_detail($1)', [id])).image_path, path);
    await asUser(B); assert.equal((await read()).rows.length, 0);
    await asUser('', 'anon'); assert.equal((await read()).rows.length, 0);
    await asUser(ADMIN); await rpc('public.admin_notification_revoke($1)', [id]);
    await asUser(A); assert.equal((await read()).rows.length, 0);
    await asUser(ADMIN);
    const draftId = await save(draft({ image_path: replacement }));
    await save(draft(), draftId);
    assert.equal((await remove(replacement)).rows.length, 1);
    assert.equal((await remove(path)).rows.length, 0); // Retained for admin history even after revoke.
    await db.exec('reset role');
    const bucket = (await db.query("select * from storage.buckets where id = 'notification-images'")).rows[0];
    assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), 5242880);
    assert.deepEqual(bucket.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  });
  await t.test('a realtime delivery failure never prevents publishing or acknowledging', async () => {
    await db.exec('reset role');
    await db.exec(`create or replace function realtime.send(payload jsonb, event text, topic text, private boolean)
      returns void language plpgsql as $$ begin raise exception 'Realtime temporarily unavailable'; end; $$;`);
    await asUser(ADMIN);
    const id = await save(draft({ priority: 'important', audience: 'selected', target_user_ids: [A] }));
    assert.equal(await rpc('public.admin_notification_publish($1)', [id]), 1);
    await asUser(A);
    await rpc('public.notification_mark_read($1, true)', [id]);
    assert.ok((await rpc('public.notification_detail($1)', [id])).acknowledged_at);
    await asUser(ADMIN);
    await rpc('public.admin_notification_revoke($1)', [id]);
  });
});
