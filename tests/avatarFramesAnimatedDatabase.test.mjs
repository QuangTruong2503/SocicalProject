import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADMIN, OTHER, USER, createAvatarFramesDb, readMigration } from './fixtures/avatarFramesDb.mjs';
import { validateFrameBytes } from '../supabase/functions/avatar-frame-inspect/frameImage.js';

// Upgrades a database that already has static frames (and a user on one of them)
// to the animated-frame migration, then exercises the new rules as each role.
const path = (n) => `frames/${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}.${n % 2 ? 'png' : 'webp'}`;
const ANIMATED = path(1); // .png  → APNG
const STILL = path(2);    // .webp → static WebP
const ANIMATED_B = path(3);
const STATIC = path(5);
const LEGACY = path(7);
const NEW_FALLBACK = path(9);
const INFO = {
  animated: { format: 'apng', frame_type: 'animated', width: 256, height: 256, file_size: 4000, frame_count: 30, duration_ms: 2400 },
  still: { format: 'webp', frame_type: 'static', width: 256, height: 256, file_size: 900, frame_count: 1, duration_ms: null },
};

test('animated frames migration: upgrade, verified metadata, fallbacks and permissions', async (t) => {
  const { db, login, asOwner, rpc } = await createAvatarFramesDb();
  t.after(() => db.close());
  const rejects = (fn, code) => assert.rejects(fn, (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });
  const save = (id, document) => rpc('select public.admin_save_avatar_frame($1, $2) as result', [id, document]);
  const record = (filePath, info) => rpc('select public.avatar_frame_record_upload($1, $2, $3) as result', [filePath, info, ADMIN]);
  const putObject = (filePath, size) => asOwner("insert into storage.objects (bucket_id, name, metadata) values ('avatar-frames', $1, $2)", [filePath, size ? { size } : null]);
  const asService = async (fn) => { await login('', 'service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
  const frame = async (id) => (await asOwner('select * from public.avatar_frames where id = $1', [id]))[0];

  // State before the upgrade: a static uploaded frame that a user picked.
  await db.exec(await readMigration('frames'));
  await putObject(LEGACY, null);
  await login(ADMIN);
  const legacy = (await save(null, { name: 'Khung cũ', image_path: LEGACY })).frame;
  await login(USER);
  await rpc('select public.set_my_avatar_frame($1) as result', [legacy.id]);

  await db.exec('reset role');
  await db.exec(await readMigration('animated'));
  await db.exec(await readMigration('animated'));

  await t.test('existing static frames and selections survive the upgrade', async () => {
    const row = await frame(legacy.id);
    assert.deepEqual([row.frame_type, row.image_format, row.fallback_path, row.frame_count, row.is_active], ['static', 'png', null, 1, true]);
    assert.equal((await frame('laurel')).image_format, 'svg');
    assert.equal((await asOwner('select avatar_frame_id from public.profiles where id = $1', [USER]))[0].avatar_frame_id, legacy.id);
    assert.equal((await asOwner("select file_size_limit from storage.buckets where id = 'avatar-frames'"))[0].file_size_limit, 2097152);
  });

  await t.test('two built-in animated frames are seeded once, with metadata matching the shipped files', async () => {
    const rows = await asOwner("select * from public.avatar_frames where frame_type = 'animated' order by id");
    assert.deepEqual(rows.map((row) => row.id), ['orbit-glow', 'twinkle-stars']);
    assert.equal((await asOwner('select count(*)::int as n from public.avatar_frames'))[0].n, 9);
    for (const row of rows) {
      const file = validateFrameBytes(new Uint8Array(readFileSync(new URL(`../public/avatar-frames/${row.image_path}`, import.meta.url))));
      assert.equal(file.error, undefined, row.image_path);
      assert.deepEqual(
        [row.image_format, row.frame_type, row.width, row.height, row.file_size, row.frame_count, row.duration_ms],
        [file.info.format, file.info.type, file.info.width, file.info.height, file.info.fileSize, file.info.frameCount, file.info.durationMs],
      );
      const fallback = validateFrameBytes(new Uint8Array(readFileSync(new URL(`../public/avatar-frames/${row.fallback_path}`, import.meta.url))));
      assert.equal(fallback.info.type, 'static', row.fallback_path);
      assert.equal(row.is_active, true);
    }
  });

  await t.test('only the service role records verified uploads, and only for real stored files', async () => {
    await putObject(ANIMATED, 4000);
    await putObject(STILL, 900);
    await putObject(ANIMATED_B, 4000);
    await putObject(STATIC, 900);
    await putObject(NEW_FALLBACK, 900);
    await login(ADMIN);
    await rejects(() => record(ANIMATED, INFO.animated), '42501');
    await asService(async () => {
      await rejects(() => record('frames/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png', INFO.animated), 'P0002');
      await rejects(() => record(ANIMATED, { ...INFO.animated, file_size: 1234 }), '22023');
      await rejects(() => record(ANIMATED, { ...INFO.animated, frame_count: 500 }), '23514');
      await rejects(() => record(ANIMATED, { ...INFO.animated, duration_ms: 12000 }), '23514');
      await rejects(() => record(ANIMATED, { ...INFO.animated, width: 1024, height: 1024 }), '23514');
      await rejects(() => record(STILL, { ...INFO.still, format: 'apng' }), '23514');
      assert.equal((await record(ANIMATED, INFO.animated)).frame_count, 30);
      await record(STILL, INFO.still);
      await record(ANIMATED_B, INFO.animated);
      await record(STATIC, { ...INFO.still, format: 'png' });
    });
    await login(USER);
    assert.equal((await db.query('select * from public.avatar_frame_uploads')).rows.length, 0);
    await rejects(() => db.query("insert into public.avatar_frame_uploads (path, format, frame_type, width, height, file_size) values ($1, 'png', 'static', 256, 256, 10)", [NEW_FALLBACK]), '42501');
  });

  let animated;
  await t.test('saving uses recorded metadata, never the document, and refuses unchecked files', async () => {
    await login(ADMIN);
    await rejects(() => save(null, { name: 'Chưa kiểm tra', image_path: NEW_FALLBACK, is_active: false }), '22023');
    await rejects(() => save(null, { name: 'Động', image_path: ANIMATED, is_active: true }), '22023');
    const result = await save(null, { name: 'Động', image_path: ANIMATED, is_active: false, frame_count: 99, frame_type: 'static', width: 9 });
    animated = result.frame;
    assert.deepEqual(
      [animated.frame_type, animated.image_format, animated.frame_count, animated.duration_ms, animated.width, animated.file_size, animated.fallback_path],
      ['animated', 'apng', 30, 2400, 256, 4000, null],
    );
    await rejects(() => save(animated.id, { name: 'Động', is_active: true }), '22023');
  });

  await t.test('fallbacks: static only, not the image itself, only for animated frames', async () => {
    await login(ADMIN);
    await rejects(() => save(animated.id, { name: 'Động', fallback_path: ANIMATED_B }), '22023');
    await rejects(() => save(animated.id, { name: 'Động', fallback_path: ANIMATED }), '22023');
    animated = (await save(animated.id, { name: 'Động', fallback_path: STILL, is_active: true })).frame;
    assert.deepEqual([animated.fallback_path, animated.is_active], [STILL, true]);
    await rejects(() => save(animated.id, { name: 'Động', remove_fallback: true }), '22023');
    await rejects(() => save('laurel', { name: 'Vòng nguyệt quế', fallback_path: STATIC }), '22023');
    // The file already used as a fallback cannot back another frame.
    await rejects(() => save(null, { name: 'Trùng', image_path: STILL, is_active: false }), '22023');
  });

  await t.test('users pick active animated frames, read their fallback, and cannot pick drafts', async () => {
    await login(ADMIN);
    const draft = (await save(null, { name: 'Nháp', image_path: ANIMATED_B, is_active: false })).frame;
    await login(USER);
    assert.deepEqual(await rpc('select public.set_my_avatar_frame($1) as result', [animated.id]), { avatar_frame_id: animated.id });
    await rejects(() => rpc('select public.set_my_avatar_frame($1) as result', [draft.id]), '22023');
    const row = (await db.query('select frame_type, fallback_path, duration_ms from public.avatar_frames where id = $1', [animated.id])).rows[0];
    assert.deepEqual(row, { frame_type: 'animated', fallback_path: STILL, duration_ms: 2400 });
  });

  await t.test('storage keeps fallbacks in use; replacing with a static image releases both old files', async () => {
    await login(ADMIN);
    assert.equal((await db.query('delete from storage.objects where name = $1 returning id', [STILL])).rows.length, 0);
    const result = await save(animated.id, { name: 'Giờ là tĩnh', image_path: STATIC });
    assert.deepEqual([result.frame.frame_type, result.frame.fallback_path, result.frame.image_format], ['static', null, 'png']);
    assert.deepEqual(result.removed_paths.sort(), [ANIMATED, STILL].sort());
    assert.equal((await db.query('delete from storage.objects where name = $1 returning id', [STILL])).rows.length, 1);
    await login(USER);
    assert.equal((await asOwner('select avatar_frame_id from public.profiles where id = $1', [USER]))[0].avatar_frame_id, animated.id);
  });

  await t.test('replacing a built-in animated frame needs an uploaded fallback; delete reports both files', async () => {
    await login(ADMIN);
    await asService(async () => { await record(ANIMATED, INFO.animated); await record(NEW_FALLBACK, INFO.still); });
    await login(ADMIN);
    await rejects(() => save('orbit-glow', { name: 'Vầng sáng xoay', image_path: ANIMATED }), '22023');
    let result = await save('orbit-glow', { name: 'Vầng sáng xoay', image_path: ANIMATED, fallback_path: NEW_FALLBACK });
    assert.deepEqual([result.frame.image_source, result.frame.fallback_path, result.removed_paths], ['storage', NEW_FALLBACK, []]);
    await login(OTHER);
    await rpc('select public.set_my_avatar_frame($1) as result', ['orbit-glow']);
    await login(ADMIN);
    result = await rpc('select public.admin_delete_avatar_frame($1) as result', ['orbit-glow']);
    assert.equal(result.affected_users, 1);
    assert.deepEqual(result.removed_paths.sort(), [ANIMATED, NEW_FALLBACK].sort());
    assert.equal((await asOwner('select avatar_frame_id from public.profiles where id = $1', [OTHER]))[0].avatar_frame_id, null);
    assert.equal((await db.query('delete from storage.objects where name = any($1) returning id', [[ANIMATED, NEW_FALLBACK]])).rows.length, 2);
  });

  await t.test('regular users still cannot use the admin RPCs', async () => {
    await login(USER);
    await rejects(() => save(null, { name: 'X', image_path: ANIMATED_B }), '42501');
    await rejects(() => rpc('select public.admin_delete_avatar_frame($1) as result', ['twinkle-stars']), '42501');
  });
});
