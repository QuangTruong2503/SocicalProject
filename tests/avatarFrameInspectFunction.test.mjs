// avatar-frame-inspect Edge Function handler with mocked Supabase Auth, REST and
// Storage. No network, no real keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAvatarFrameInspectHandler } from '../supabase/functions/avatar-frame-inspect/handler.js';
import { pngBytes, svgBytes, webpBytes } from './fixtures/frameImages.mjs';

const SUPABASE_URL = 'https://project.supabase.co';
const SERVICE_KEY = 'service-role-SECRET';
const USER_ID = '20000000-0000-4000-8000-000000000001';
const PATH = 'frames/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';

function setup({ admin = true, file = pngBytes({ delays: Array(30).fill(80) }), fileStatus = 200, contentLength, recordStatus = 200, env = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const headers = init.headers || {};
    calls.push({ url, method: init.method || 'GET', headers, body: init.body });
    if (url.endsWith('/auth/v1/user')) {
      return headers.Authorization === 'Bearer user-token'
        ? new Response(JSON.stringify({ id: USER_ID }), { status: 200 })
        : new Response('{}', { status: 401 });
    }
    if (url.endsWith('/rest/v1/rpc/avatar_frames_require_admin')) {
      return admin ? new Response('null', { status: 200 }) : new Response(JSON.stringify({ code: '42501' }), { status: 403 });
    }
    if (url.includes('/storage/v1/object/authenticated/avatar-frames/')) {
      if (fileStatus !== 200) return new Response('{}', { status: fileStatus });
      return new Response(file, { status: 200, headers: contentLength ? { 'content-length': String(contentLength) } : {} });
    }
    if (url.endsWith('/storage/v1/object/avatar-frames') && init.method === 'DELETE') return new Response('[]', { status: 200 });
    if (url.endsWith('/rest/v1/rpc/avatar_frame_record_upload')) return new Response('{}', { status: recordStatus });
    return new Response('{}', { status: 500 });
  };
  const values = { SUPABASE_URL, SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, ...env };
  const handler = createAvatarFrameInspectHandler({ getEnv: (name) => values[name], fetchImpl, logger: { warn() {}, error() {} } });
  const send = (body = { path: PATH }, { token = 'user-token', method = 'POST' } = {}) => handler(new Request(`${SUPABASE_URL}/functions/v1/avatar-frame-inspect`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }));
  return { calls, send };
}

const read = async (response) => ({ status: response.status, body: await response.json() });

test('a verified APNG is recorded with the service role and the caller as inspector', async () => {
  const { calls, send } = setup();
  const { status, body } = await read(await send());
  assert.equal(status, 200);
  assert.deepEqual(body.info, { format: 'apng', frame_type: 'animated', width: 256, height: 256, file_size: pngBytes({ delays: Array(30).fill(80) }).length, frame_count: 30, duration_ms: 2400 });
  const download = calls.find((call) => call.url.includes('/object/authenticated/'));
  assert.equal(download.headers.Authorization, 'Bearer user-token', 'the file is read with the admin token, not the service key');
  const record = calls.find((call) => call.url.endsWith('avatar_frame_record_upload'));
  assert.equal(record.headers.Authorization, `Bearer ${SERVICE_KEY}`);
  assert.deepEqual(JSON.parse(record.body), { p_path: PATH, p_info: body.info, p_inspected_by: USER_ID });
});

test('animated and static WebP are told apart from the stored bytes', async () => {
  const animated = await read(await setup({ file: webpBytes({ width: 256, height: 256, delays: Array(24).fill(100) }) }).send());
  assert.deepEqual([animated.body.info.format, animated.body.info.frame_type, animated.body.info.frame_count], ['webp', 'animated', 24]);
  const still = await read(await setup({ file: webpBytes({ width: 256, height: 256 }) }).send());
  assert.deepEqual([still.body.info.frame_type, still.body.info.duration_ms], ['static', null]);
});

test('invalid files are refused with a reason, removed with the admin token, and never recorded', async () => {
  for (const file of [svgBytes(), pngBytes({ delays: Array(121).fill(20) }), pngBytes({ width: 1024, height: 1024 })]) {
    const { calls, send } = setup({ file });
    const { status, body } = await read(await send());
    assert.equal(status, 422);
    assert.equal(body.error.code, 'invalid_file');
    assert.ok(body.error.message.length > 10);
    const removal = calls.find((call) => call.method === 'DELETE');
    assert.deepEqual(JSON.parse(removal.body), { prefixes: [PATH] });
    assert.equal(removal.headers.Authorization, 'Bearer user-token');
    assert.equal(calls.some((call) => call.url.endsWith('avatar_frame_record_upload')), false);
  }
  const { status, body } = await read(await setup({ contentLength: 3 * 1024 * 1024 }).send());
  assert.equal(status, 422);
  assert.match(body.error.message, /2 MB/);
});

test('only signed-in admins can inspect, and only files in the frames folder', async () => {
  let result = await read(await setup().send(undefined, { token: '' }));
  assert.deepEqual([result.status, result.body.error.code], [401, 'AUTH_REQUIRED']);
  result = await read(await setup().send(undefined, { token: 'forged' }));
  assert.equal(result.status, 401);

  const nonAdmin = setup({ admin: false });
  result = await read(await nonAdmin.send());
  assert.deepEqual([result.status, result.body.error.code], [403, 'FORBIDDEN']);
  assert.equal(nonAdmin.calls.some((call) => call.url.includes('/storage/')), false, 'nothing is downloaded for non-admins');

  for (const path of ['user-images/x.png', 'frames/../secret.png', 'frames/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.svg', '']) {
    const bad = setup();
    result = await read(await bad.send({ path }));
    assert.equal(result.status, 400);
    assert.equal(bad.calls.length, 0);
  }
});

test('missing files, missing configuration and recording failures are reported', async () => {
  assert.equal((await setup({ fileStatus: 404 }).send()).status, 404);
  const unconfigured = await read(await setup({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } }).send());
  assert.deepEqual([unconfigured.status, unconfigured.body.error.code], [503, 'not_configured']);
  assert.equal((await setup({ recordStatus: 500 }).send()).status, 503);
  assert.equal((await setup().send(undefined, { method: 'GET' })).status, 405);
  const preflight = await setup().send(undefined, { method: 'OPTIONS' });
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
});
