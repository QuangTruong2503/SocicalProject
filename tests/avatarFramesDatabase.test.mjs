import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Runs the real migration in PGlite with stand-ins for Supabase's auth/storage
// schemas and the existing profiles grants, then exercises it as each role.
const ADMIN = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const SUSPENDED = '44444444-4444-4444-8444-444444444444';
const FILE_A = 'frames/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
const FILE_B = 'frames/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp';
const sql = await readFile(new URL('../supabase/migrations/20261020090000_avatar_frames.sql', import.meta.url), 'utf8');

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;

    create table public.profiles (
      id uuid primary key, username text, full_name text, avatar_url text,
      role text default 'user', status text default 'active', plan text,
      updated_at timestamptz default now()
    );
    insert into public.profiles (id, username, role, status) values
      ('${ADMIN}', 'admin', 'admin', 'active'), ('${USER}', 'user', 'user', 'active'),
      ('${OTHER}', 'other', 'user', 'active'), ('${SUSPENDED}', 'locked', 'user', 'suspended');
    alter table public.profiles enable row level security;
    -- Same shape as supabase_profiles_auth_sync.sql.
    grant select on public.profiles to authenticated;
    grant update (username, full_name, avatar_url) on public.profiles to authenticated;
    create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
    create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

    create function public.is_admin() returns boolean language sql stable security definer set search_path = public
      as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and coalesce(status, 'active') <> 'suspended') $$;
    create function public.is_active_user() returns boolean language sql stable security definer set search_path = public
      as $$ select auth.uid() is not null and coalesce((select status from public.profiles where id = auth.uid()), 'active') <> 'suspended' $$;
    create policy profiles_select_admin on public.profiles for select to authenticated using (public.is_admin());

    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id bigint generated always as identity primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
    grant usage on sequence storage.objects_id_seq to authenticated;
  `);
  return db;
}

test('avatar frame migration: catalog, selection, admin management and storage rules', async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await db.exec(sql);
  await db.exec(sql);

  const login = async (uid, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.exec(`set role ${role}`);
  };
  const asOwner = async (query, args = []) => {
    await db.exec('reset role');
    return (await db.query(query, args)).rows;
  };
  const rpc = async (query, args = []) => (await db.query(query, args)).rows[0]?.result;
  const rejects = (fn, code) => assert.rejects(fn, (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });
  const setFrame = (id) => rpc('select public.set_my_avatar_frame($1) as result', [id]);
  const save = (id, document) => rpc('select public.admin_save_avatar_frame($1, $2) as result', [id, document]);
  const remove = (id) => rpc('select public.admin_delete_avatar_frame($1) as result', [id]);
  const reorder = (ids) => rpc('select public.admin_reorder_avatar_frames($1) as result', [ids]);
  const list = () => rpc('select public.admin_list_avatar_frames() as result');
  const frameOf = async (uid) => (await asOwner('select avatar_frame_id from public.profiles where id = $1', [uid]))[0].avatar_frame_id;

  await t.test('seeds six built-in frames once; re-running does not duplicate or resurrect them', async () => {
    const rows = await asOwner('select id, image_source, image_path, is_active from public.avatar_frames order by sort_order');
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.image_source === 'builtin' && row.is_active && row.image_path.endsWith('.svg')));
    await asOwner("delete from public.avatar_frames where id = 'sakura'");
    await db.exec(sql);
    assert.equal((await asOwner('select count(*)::int as n from public.avatar_frames'))[0].n, 5);
    const bucket = (await asOwner("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatar-frames'"))[0];
    assert.deepEqual(bucket, { public: true, file_size_limit: 1048576, allowed_mime_types: ['image/png', 'image/webp'] });
  });

  await t.test('anonymous visitors cannot read the catalog or pick a frame', async () => {
    await login('', 'anon');
    await rejects(() => db.query('select * from public.avatar_frames'), '42501');
    await rejects(() => setFrame('laurel'), '42501');
  });

  await t.test('a user picks an active frame, removes it, and nothing else on the profile changes', async () => {
    await login(USER);
    assert.deepEqual(await setFrame('laurel'), { avatar_frame_id: 'laurel' });
    assert.equal(await frameOf(USER), 'laurel');
    await login(USER);
    assert.deepEqual(await setFrame('  '), { avatar_frame_id: null });
    assert.deepEqual(await setFrame(null), { avatar_frame_id: null });
    await setFrame('starlight');
    const row = (await asOwner('select role, status, username from public.profiles where id = $1', [USER]))[0];
    assert.deepEqual(row, { role: 'user', status: 'active', username: 'user' });
  });

  await t.test('disabled or unknown frames cannot be picked, even with a hand-written request', async () => {
    await asOwner("update public.avatar_frames set is_active = false where id = 'neon-glow'");
    await login(USER);
    await rejects(() => setFrame('neon-glow'), '22023');
    await rejects(() => setFrame('does-not-exist'), '22023');
    assert.equal(await frameOf(USER), 'starlight');
    await login(USER);
    const visible = (await db.query('select id from public.avatar_frames')).rows.map((row) => row.id);
    assert.equal(visible.includes('neon-glow'), false);
  });

  await t.test('users cannot write the column directly, nor touch another account', async () => {
    await login(USER);
    await rejects(() => db.query("update public.profiles set avatar_frame_id = 'laurel' where id = $1", [USER]), '42501');
    await rejects(() => db.query("update public.profiles set avatar_frame_id = null where id = $1", [OTHER]), '42501');
    await rejects(() => db.query("update public.profiles set role = 'admin' where id = $1", [USER]), '42501');
    // The RPC has no target parameter: it only ever writes the caller's row.
    await login(OTHER);
    await setFrame('laurel');
    assert.equal(await frameOf(USER), 'starlight');
    assert.equal(await frameOf(OTHER), 'laurel');
  });

  await t.test('the trigger still blocks disabled frames if a table-level grant exists', async () => {
    await asOwner('grant update on public.profiles to authenticated');
    try {
      await login(USER);
      await rejects(() => db.query("update public.profiles set avatar_frame_id = 'neon-glow' where id = $1", [USER]), '22023');
      // RLS still keeps other rows out of reach.
      const result = await db.query("update public.profiles set avatar_frame_id = null where id = $1 returning id", [OTHER]);
      assert.equal(result.rows.length, 0);
      assert.equal(await frameOf(OTHER), 'laurel');
    } finally {
      await asOwner('revoke update on public.profiles from authenticated');
      await asOwner('grant update (username, full_name, avatar_url) on public.profiles to authenticated');
    }
  });

  await t.test('suspended accounts cannot change their frame', async () => {
    await login(SUSPENDED);
    await rejects(() => setFrame('laurel'), '42501');
  });

  await t.test('regular users cannot manage the catalog through RPCs, tables or storage', async () => {
    await login(USER);
    await rejects(list, '42501');
    await rejects(() => save(null, { name: 'Hack', image_path: FILE_A }), '42501');
    await rejects(() => save('laurel', { name: 'Hack' }), '42501');
    await rejects(() => remove('laurel'), '42501');
    await rejects(() => reorder(['laurel']), '42501');
    await rejects(() => db.query("insert into public.avatar_frames (id, name, image_source, image_path) values ('x-frame', 'X', 'builtin', 'x.svg')"), '42501');
    await rejects(() => db.query("update public.avatar_frames set is_active = true where id = 'neon-glow'"), '42501');
    await rejects(() => db.query("delete from public.avatar_frames where id = 'laurel'"), '42501');
    await rejects(() => db.query("insert into storage.objects (bucket_id, name) values ('avatar-frames', $1)", [FILE_A]), '42501');
  });

  let created;
  await t.test('admin creates a frame only from a real, unused upload in the bucket', async () => {
    await login(ADMIN);
    await rejects(() => save(null, { name: 'Mới', image_path: FILE_A }), '22023');
    await rejects(() => db.query("insert into storage.objects (bucket_id, name) values ('avatar-frames', 'frames/evil.svg')"), '42501');
    await db.query("insert into storage.objects (bucket_id, name) values ('avatar-frames', $1), ('avatar-frames', $2)", [FILE_A, FILE_B]);
    await rejects(() => save(null, { name: 'Không ảnh' }), '22023');
    await rejects(() => save(null, { name: '', image_path: FILE_A }), '22023');
    await rejects(() => save(null, { name: 'x'.repeat(61), image_path: FILE_A }), '22023');
    await rejects(() => save(null, { name: 'Sai kiểu', image_path: FILE_A, is_active: 'yes' }), '22023');
    const result = await save(null, { name: '  Khung mới  ', image_path: FILE_A, is_active: true });
    created = result.frame;
    assert.match(created.id, /^frame-[0-9a-f]{16}$/);
    assert.equal(created.name, 'Khung mới');
    assert.equal(created.image_source, 'storage');
    assert.equal(created.sort_order, 7);
    assert.equal(created.usage_count, 0);
    assert.equal(result.previous_image_path, null);
    // The same file cannot back a second frame.
    await rejects(() => save(null, { name: 'Trùng file', image_path: FILE_A }), '22023');
  });

  await t.test('admin renames, disables and replaces the image; the old file is reported for cleanup', async () => {
    await login(ADMIN);
    let result = await save(created.id, { name: 'Đổi tên', is_active: false });
    assert.equal(result.frame.name, 'Đổi tên');
    assert.equal(result.frame.is_active, false);
    assert.equal(result.frame.image_path, FILE_A);
    result = await save(created.id, { name: 'Đổi tên', is_active: true, image_path: FILE_B });
    assert.equal(result.frame.image_path, FILE_B);
    assert.equal(result.previous_image_path, FILE_A);
    // Replacing a built-in frame's SVG reports nothing to delete.
    await db.exec('reset role');
    await db.query("insert into storage.objects (bucket_id, name) values ('avatar-frames', 'frames/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png')");
    await login(ADMIN);
    result = await save('classic-ring', { name: 'Viền cổ điển', image_path: 'frames/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png' });
    assert.equal(result.previous_image_path, null);
    assert.equal(result.frame.image_source, 'storage');
    await rejects(() => save('missing-frame', { name: 'X' }), 'P0002');
  });

  await t.test('storage keeps files that a frame still uses and lets admins clean up the rest', async () => {
    await login(ADMIN);
    assert.equal((await db.query('delete from storage.objects where name = $1 returning id', [FILE_B])).rows.length, 0);
    assert.equal((await db.query('delete from storage.objects where name = $1 returning id', [FILE_A])).rows.length, 1);
    await login(USER);
    assert.equal(await rpc("select public.avatar_frames_can_remove_image('frames/orphan.png') as result"), false);
  });

  await t.test('admin list shows disabled frames with usage counts, in order', async () => {
    await login(USER);
    await setFrame(created.id);
    await login(ADMIN);
    const frames = await list();
    assert.deepEqual(frames.map((frame) => frame.sort_order), [...frames.map((frame) => frame.sort_order)].sort((a, b) => a - b));
    assert.equal(frames.find((frame) => frame.id === 'neon-glow').is_active, false);
    assert.equal(frames.find((frame) => frame.id === created.id).usage_count, 1);
    assert.equal(frames.find((frame) => frame.id === 'laurel').usage_count, 1);
  });

  await t.test('reorder needs the complete current list and rejects outdated ones', async () => {
    await login(ADMIN);
    const ids = (await list()).map((frame) => frame.id);
    const reversed = [...ids].reverse();
    assert.ok(await reorder(reversed) > 0);
    assert.deepEqual((await list()).map((frame) => frame.id), reversed);
    assert.deepEqual((await list()).map((frame) => frame.sort_order), reversed.map((_, index) => index + 1));
    await rejects(() => reorder(reversed.slice(1)), '40001');
    await rejects(() => reorder([...reversed.slice(1), reversed[1]]), '40001');
    await rejects(() => reorder([...reversed.slice(1), 'ghost']), '40001');
  });

  await t.test('disabling a frame keeps the saved choice but hides the frame from users', async () => {
    await login(ADMIN);
    await save(created.id, { name: 'Đổi tên', is_active: false });
    assert.equal(await frameOf(USER), created.id);
    await login(USER);
    assert.equal((await db.query('select id from public.avatar_frames where id = $1', [created.id])).rows.length, 0);
    // Removing the frame is still allowed.
    assert.deepEqual(await setFrame(null), { avatar_frame_id: null });
    await login(ADMIN);
    await save(created.id, { name: 'Đổi tên', is_active: true });
    await login(USER);
    await setFrame(created.id);
  });

  await t.test('deleting a frame clears it from profiles and releases its file', async () => {
    await login(ADMIN);
    const result = await remove(created.id);
    assert.deepEqual(result, { id: created.id, affected_users: 1, image_path: FILE_B });
    assert.equal(await frameOf(USER), null);
    await login(ADMIN);
    assert.equal((await db.query('delete from storage.objects where name = $1 returning id', [FILE_B])).rows.length, 1);
    await rejects(() => remove(created.id), 'P0002');
    // Built-in frames report no file to delete.
    assert.deepEqual(await remove('laurel'), { id: 'laurel', affected_users: 1, image_path: null });
    assert.equal(await frameOf(OTHER), null);
  });

  await t.test('a suspended admin loses management rights', async () => {
    await asOwner("update public.profiles set status = 'suspended' where id = $1", [ADMIN]);
    await login(ADMIN);
    await rejects(list, '42501');
    await rejects(() => remove('starlight'), '42501');
  });
});
