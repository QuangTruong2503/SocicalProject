// Edge Function handler wired to the real ledger SQL (PGlite), with mocked
// Supabase Auth and OpenAI. Covers what is recorded per request and attempt,
// idempotent resends, shared limits across handler instances and failure policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSuggestImageNamesHandler } from '../supabase/functions/suggest-image-names/handler.js';
import { OPENAI_RESPONSES_URL } from '../supabase/functions/suggest-image-names/openai.js';
import { createPgliteLedger, createUsageDb, ids, queryAs } from './fixtures/usageDb.mjs';

const SUPABASE_URL = 'https://project.supabase.co';
const FAKE_KEY = 'sk-test-SECRET-should-never-leak';
const PRODUCT = 'Máy khoan Bosch GSB 13 RE';
const PROMPT = 'BÍ-MẬT-PROMPT cho {{productName}}';
const DATA_URL = `data:image/jpeg;base64,${'Q'.repeat(400)}`;
const RUN_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const uuid = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USAGE = {
  input_tokens: 1200,
  input_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 },
  output_tokens: 90,
  output_tokens_details: { reasoning_tokens: 30 },
  total_tokens: 1290,
};

const requestedIds = (init) => JSON.parse(init.body).text.format.schema.properties.items.items.properties.imageId.enum;

/** OpenAI 200 answering every requested ID, with usage and provider IDs. */
function named({ usage = USAGE, model = 'gpt-6-luna-2026-05-01', tier = 'default', delayMs = 0, items } = {}) {
  return async (init) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const answer = items ?? requestedIds(init).map((imageId) => ({ imageId, descriptor: 'toàn cảnh', needsReview: false }));
    return Response.json({
      id: `resp_${Math.random().toString(36).slice(2, 10)}`,
      model,
      status: 'completed',
      service_tier: tier,
      ...(usage ? { usage } : {}),
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ items: answer }) }] }],
    }, { headers: { 'x-request-id': 'req_provider_1' } });
  };
}

const rawOutput = (body) => () => Response.json({ id: 'resp_raw', model: 'gpt-6-luna', usage: USAGE, ...body }, { headers: { 'x-request-id': 'req_raw' } });
const rateLimited = () => Response.json({ error: { code: 'rate_limit_exceeded', message: `echo ${FAKE_KEY}` } }, { status: 429, headers: { 'retry-after': '1', 'x-request-id': 'req_429' } });
const hang = (init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));

/**
 * One handler instance. Tokens are "jwt:<user id>"; `denied` users get
 * ai_naming_models = []. `openai` is a shared queue of responders.
 */
function createInstance(db, { openai = [], env = {}, denied = [], ledger, calls = { openai: 0, logs: [] } } = {}) {
  const fetchImpl = async (url, init = {}) => {
    const token = String(init.headers?.Authorization || '').replace(/^Bearer /, '');
    if (url === `${SUPABASE_URL}/auth/v1/user`) {
      if (!token.startsWith('jwt:')) return Response.json({ msg: 'bad jwt' }, { status: 401 });
      return Response.json({ id: token.slice(4) });
    }
    if (url === `${SUPABASE_URL}/rest/v1/rpc/ai_naming_models`) {
      if (denied.includes(token.slice(4))) return Response.json([]);
      const { rows: [row] } = await queryAs(db, 'authenticated', token.slice(4), 'select public.ai_naming_models() as models');
      return Response.json(row.models);
    }
    if (url === OPENAI_RESPONSES_URL) {
      calls.openai += 1;
      const next = openai.shift();
      return next ? next(init) : named()(init);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const fullEnv = {
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_x"}',
    OPENAI_IMAGE_NAME_KEY: FAKE_KEY,
    OPENAI_IMAGE_NAME_KEY_ALIAS: 'image-naming-test-v1',
    AI_USAGE_ENVIRONMENT: 'test',
    ...env,
  };
  const logger = { warn: (...args) => calls.logs.push(args), error: (...args) => calls.logs.push(args) };
  const handler = createSuggestImageNamesHandler({
    getEnv: (name) => fullEnv[name],
    fetchImpl,
    sleep: async () => {},
    random: () => 0,
    logger,
    openAITimeoutMs: 30,
    ledger: ledger ?? createPgliteLedger(db),
  });
  return { handler, calls };
}

function post(body, user = ids.pro) {
  return new Request('https://fn.example/suggest-image-names', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer jwt:${user}` } : {}) },
    body: JSON.stringify(body),
  });
}

const images = (count, start = 1) => Array.from({ length: count }, (_, index) => ({ id: `res-${start + index}`, position: start + index, dataUrl: DATA_URL }));
const batch = (n, count, extra = {}) => ({ productName: PRODUCT, prompt: PROMPT, images: images(count), requestId: uuid(n), aiRunId: RUN_ID, ...extra });

async function rows(db, sql, params) {
  return (await db.query(sql, params)).rows;
}

async function overview(db, filters = {}) {
  const { rows: [row] } = await queryAs(db, 'authenticated', ids.admin,
    "select public.admin_usage_overview(now() - interval '1 day', now() + interval '1 day', $1::jsonb) as o", [JSON.stringify(filters)]);
  return row.o;
}

test('13 images split 6+6+1, one batch retried: 1 run, 3 requests, 4 attempts, 13 business images', async (t) => {
  const db = await createUsageDb(t);
  const openai = [rateLimited, named(), named(), named()];
  const { handler, calls } = createInstance(db, { openai });
  const all = images(13);
  const chunks = [all.slice(0, 6), all.slice(6, 12), all.slice(12)];
  for (const [index, chunk] of chunks.entries()) {
    const response = await handler(post({ productName: PRODUCT, prompt: PROMPT, images: chunk, requestId: uuid(index + 1), aiRunId: RUN_ID }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.items.length, chunk.length);
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  }
  assert.equal(calls.openai, 4);

  const o = await overview(db);
  assert.equal(o.ai.runs, 1);
  assert.equal(o.ai.requests, 3);
  assert.equal(o.ai.attempts, 4);
  assert.equal(o.ai.requests_with_retry, 1);
  assert.equal(o.ai.images_requested, 13, 'business images counted once per logical request');
  assert.equal(o.ai.images_succeeded, 13);
  assert.equal(o.ai.provider_image_sends, 19, 'the retried 6-image batch was sent twice');
  // Tokens/cost only from the 3 attempts that reported usage; the 429 has none.
  assert.equal(o.ai.attempts_usage_missing, 1);
  assert.equal(o.ai.input_tokens, 3 * 1200);
  assert.equal(o.ai.reasoning_tokens, 3 * 30);
  assert.equal(o.ai.total_tokens, 3 * 1290);

  const attempts = await rows(db, `select a.attempt_number, a.status, a.http_status, a.will_retry, a.retry_reason, a.usage_status,
      a.provider_request_id, a.resolved_model, a.cost_status, a.estimated_cost_usd::text as cost
    from usage_private.ai_usage_attempts a join usage_private.ai_usage_requests r on r.id = a.request_id
    where r.client_request_id = $1 order by a.attempt_number`, [uuid(1)]);
  assert.deepEqual(attempts.map((a) => [a.attempt_number, a.status, a.http_status, a.will_retry, a.retry_reason, a.usage_status]), [
    [1, 'failed', 429, true, 'rate_limited', 'missing'],
    [2, 'succeeded', 200, false, null, 'reported'],
  ]);
  assert.equal(attempts[0].provider_request_id, 'req_429');
  assert.equal(attempts[0].cost_status, 'unknown', 'no usage → cost unknown, not 0');
  assert.equal(attempts[1].resolved_model, 'gpt-6-luna-2026-05-01');
  // (1000 × 0.10 + 200 × 0.01 + 90 × 0.50) / 1M — reasoning tokens are inside output, not added again.
  assert.equal(attempts[1].cost, '0.0001470000');
  assert.equal(Number(o.ai.estimated_cost_usd).toFixed(7), (3 * 0.000147).toFixed(7));
});

test('usage is kept when the output is unusable; the business result says failed/partial', async (t) => {
  const db = await createUsageDb(t);
  const cases = [
    [rawOutput({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }), 'failed', 'upstream_incomplete'],
    [rawOutput({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }), 'failed', 'upstream_refused'],
    [rawOutput({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }] }), 'failed', 'upstream_invalid_output'],
    [named({ items: [{ imageId: 'res-1', descriptor: 'mặt trước', needsReview: true }] }), 'partial', 'missing'],
  ];
  const { handler } = createInstance(db, { openai: cases.map(([responder]) => responder) });
  for (const [index, [, status, code]] of cases.entries()) {
    const response = await handler(post(batch(index + 1, 2)));
    assert.equal(response.status, 200, code);
    const [request] = await rows(db, `select r.status, r.error_code, r.images_succeeded, r.images_failed, r.needs_review_count,
        a.usage_status, a.input_tokens, a.cost_status
      from usage_private.ai_usage_requests r join usage_private.ai_usage_attempts a on a.request_id = r.id
      where r.client_request_id = $1`, [uuid(index + 1)]);
    assert.equal(request.status, status, code);
    assert.equal(request.error_code, code);
    assert.equal(request.usage_status, 'reported', `${code}: tokens were spent and are recorded`);
    assert.equal(Number(request.input_tokens), 1200);
    assert.equal(request.cost_status, 'estimated');
  }
  const [partial] = await rows(db, 'select images_succeeded, images_failed, needs_review_count from usage_private.ai_usage_requests where client_request_id = $1', [uuid(4)]);
  assert.deepEqual(partial, { images_succeeded: 1, images_failed: 1, needs_review_count: 1 });
});

test('timeouts leave usage unknown (never 0); auth/quota errors are not retried', async (t) => {
  const db = await createUsageDb(t);
  const quota = () => Response.json({ error: { code: 'insufficient_quota' } }, { status: 429 });
  const auth = () => Response.json({ error: { code: 'invalid_api_key' } }, { status: 401 });
  const { handler, calls } = createInstance(db, { openai: [hang, hang, hang, quota, auth] });

  assert.equal((await handler(post(batch(1, 1)))).status, 504);
  assert.equal(calls.openai, 3);
  assert.equal((await handler(post(batch(2, 1)))).status, 503);
  assert.equal((await handler(post(batch(3, 1)))).status, 502);
  assert.equal(calls.openai, 5, 'quota and auth failures: one attempt each');

  const attempts = await rows(db, `select r.client_request_id, a.status, a.error_code, a.usage_status, a.cost_status, a.input_tokens
    from usage_private.ai_usage_attempts a join usage_private.ai_usage_requests r on r.id = a.request_id order by r.created_at, a.attempt_number`);
  assert.deepEqual(attempts.filter((a) => a.client_request_id === uuid(1)).map((a) => [a.status, a.error_code, a.usage_status, a.cost_status]),
    Array.from({ length: 3 }, () => ['unknown', 'upstream_timeout', 'unknown', 'unknown']));
  assert.ok(attempts.every((a) => a.input_tokens === null));
  const [timeoutRequest] = await rows(db, 'select status, error_code, http_status from usage_private.ai_usage_requests where client_request_id = $1', [uuid(1)]);
  assert.deepEqual(timeoutRequest, { status: 'failed', error_code: 'upstream_timeout', http_status: 504 });

  const o = await overview(db);
  assert.equal(o.ai.attempts_usage_unknown, 3);
  assert.equal(o.ai.attempts_estimated, 0);
  assert.equal(o.ai.estimated_cost_usd, 0);
});

test('same requestId twice (also concurrently) calls OpenAI once; a changed payload is a conflict', async (t) => {
  const db = await createUsageDb(t);
  const openai = [named({ delayMs: 40 })];
  const shared = { openai: 0, logs: [] };
  const a = createInstance(db, { openai, calls: shared });
  const b = createInstance(db, { openai, calls: shared });

  const [first, second] = await Promise.all([a.handler(post(batch(1, 2))), b.handler(post(batch(1, 2)))]);
  assert.equal(shared.openai, 1, 'two instances, one provider call');
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const busy = [first, second].find((response) => response.status === 409);
  assert.equal((await busy.json()).error.code, 'REQUEST_IN_PROGRESS');

  // Resend after completion → stored answer, no provider call.
  const replay = await a.handler(post(batch(1, 2)));
  assert.equal(replay.status, 200);
  const replayBody = await replay.json();
  assert.equal(replayBody.replayed, true);
  assert.equal(replayBody.items.length, 2);
  assert.equal(shared.openai, 1);

  const conflict = await a.handler(post(batch(1, 2, { productName: 'Sản phẩm khác' })));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, 'IDEMPOTENCY_CONFLICT');
  for (const changed of [{ model: 'gpt-6.1-sol' }, { prompt: 'Prompt mới' }]) {
    const differentSettings = await a.handler(post(batch(1, 2, changed)));
    assert.equal(differentSettings.status, 409);
    assert.equal((await differentSettings.json()).error.code, 'IDEMPOTENCY_CONFLICT');
  }
  assert.equal(shared.openai, 1, 'changed model/prompt cannot replay or start a paid call under the same ID');
  assert.equal(shared.openai, 1);

  // Another account reusing the same ID gets its own request — never the first user's result.
  const other = await a.handler(post(batch(1, 2), ids.pro2));
  assert.equal(other.status, 200);
  assert.equal((await other.json()).replayed, undefined);
  assert.equal(shared.openai, 2);

  const [request] = await rows(db, 'select replay_count from usage_private.ai_usage_requests where user_id = $1 and status = $2', [ids.pro, 'succeeded']);
  assert.equal(request.replay_count, 1);
  const o = await overview(db);
  assert.equal(o.ai.requests, 2, 'replays and duplicates add no request');
  assert.equal(o.ai.attempts, 2);
});

test('a failed or unknown outcome is not retried for free under the same requestId', async (t) => {
  const db = await createUsageDb(t);
  const { handler, calls } = createInstance(db, { openai: [hang, hang, hang] });
  assert.equal((await handler(post(batch(1, 1)))).status, 504);
  const again = await handler(post(batch(1, 1)));
  assert.equal(again.status, 504, 'stored failure replayed');
  assert.equal(calls.openai, 3);
  // The user's own "Thử lại" uses a new requestId → a new, charged request.
  assert.equal((await handler(post(batch(2, 1)))).status, 200);
  assert.equal(calls.openai, 4);
});

test('admin model changes in SQL are enforced by the handler before another paid call and rejections are logged', async (t) => {
  const db = await createUsageDb(t);
  const { handler, calls } = createInstance(db);
  assert.equal((await handler(post(batch(1, 1, { model: 'gpt-6.1-sol' })))).status, 200);
  await queryAs(db, 'authenticated', ids.admin,
    "select public.admin_usage_config_change('plan_models.update', $1::jsonb)",
    [JSON.stringify({ plan: 'pro', allowed_models: ['gpt-6-luna'] })]);
  const rejected = await handler(post(batch(2, 1, { model: 'gpt-6.1-sol', role: 'admin', plan: 'enterprise' })));
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).error.code, 'AI_NAMING_MODEL_DENIED');
  assert.equal(calls.openai, 1);
  assert.equal((await handler(post(batch(3, 1, { model: 'gpt-6-luna' })))).status, 200);
  assert.equal(calls.openai, 2);
  const [record] = await rows(db, "select requested_model, status, user_id from usage_private.ai_usage_requests where error_code = 'AI_NAMING_MODEL_DENIED'");
  assert.deepEqual(record, { requested_model: 'gpt-6.1-sol', status: 'rejected', user_id: ids.pro });
});

test('ledger down before the call → 503 and OpenAI is never called', async (t) => {
  const db = await createUsageDb(t);
  const ledger = createPgliteLedger(db, { failOn: { ai_usage_begin: () => true } });
  const { handler, calls } = createInstance(db, { ledger });
  const response = await handler(post(batch(1, 2)));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'usage_tracking_unavailable');
  assert.equal(calls.openai, 0);

  // No server key configured at all: same rule.
  const unconfigured = createSuggestImageNamesHandler({
    getEnv: (name) => ({ SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS: '["pk"]', OPENAI_IMAGE_NAME_KEY: FAKE_KEY })[name],
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: ids.pro });
      if (url.endsWith('/ai_naming_models')) return Response.json(['gpt-6-luna']);
      throw new Error(`unexpected ${url}`);
    },
    logger: { warn() {}, error() {} },
  });
  assert.equal((await unconfigured(post(batch(2, 1)))).status, 503);
});

test('ledger writes failing after the call: no extra OpenAI call, request stays pending, then unknown', async (t) => {
  const db = await createUsageDb(t);
  const ledger = createPgliteLedger(db, { failOn: { ai_usage_finish: () => true, ai_usage_attempt_finish: () => true } });
  const { handler, calls } = createInstance(db, { ledger });
  const response = await handler(post(batch(1, 2)));
  assert.equal(response.status, 200, 'the user still gets the names');
  assert.equal(calls.openai, 1, 'never call the provider again to recover a log');
  assert.ok(calls.logs.some(([message, detail]) => /usage ledger write failed/.test(message) && detail.step === 'finish'));

  const [pending] = await rows(db, "select id, status from usage_private.ai_usage_requests where client_request_id = $1", [uuid(1)]);
  assert.equal(pending.status, 'running');
  let o = await overview(db);
  assert.equal(o.ai.attempts_open, 1, 'the attempt that started is visible');

  await db.exec(`update usage_private.ai_usage_requests set lease_expires_at = now() - interval '1 second' where id = '${pending.id}'`);
  o = await overview(db);
  assert.equal(o.health.stale_running, 1);
  const { rows: [{ swept }] } = await queryAs(db, 'authenticated', ids.admin, 'select public.admin_usage_sweep() as swept');
  assert.equal(swept, 1);
  o = await overview(db);
  assert.equal(o.ai.requests_by_status.unknown, 1);
  assert.equal(o.health.swept_in_range, 1);
  assert.equal(o.ai.attempts_usage_unknown, 1, 'shown as unknown usage, not 0 tokens');
});

test('limits are shared by every instance: concurrency, window, quota, pause', async (t) => {
  const db = await createUsageDb(t);
  const openai = [];
  const shared = { openai: 0, logs: [] };
  const instances = [createInstance(db, { openai, calls: shared }), createInstance(db, { openai, calls: shared })];
  for (let index = 0; index < 3; index += 1) openai.push(named({ delayMs: 60 }));

  const results = await Promise.all([1, 2, 3].map((n) => instances[n % 2].handler(post(batch(n, 1)))));
  const codes = await Promise.all(results.map(async (response) => (response.status === 200 ? 200 : (await response.json()).error.code)));
  assert.deepEqual(codes.sort(), [200, 200, 'too_many_concurrent'].sort(), 'max 2 at once per user, across instances');
  assert.equal(shared.openai, 2);

  // Expired leases free their slot (a killed process cannot hold it forever).
  await db.exec(`insert into usage_private.ai_usage_requests (user_id, feature, environment, status, images_requested, lease_expires_at, created_at)
    values ('${ids.pro2}', 'ai_image_naming', 'test', 'running', 1, now() - interval '1 second', now() - interval '20 minutes'),
           ('${ids.pro2}', 'ai_image_naming', 'test', 'running', 1, now() - interval '1 second', now() - interval '20 minutes')`);
  assert.equal((await instances[0].handler(post(batch(10, 1), ids.pro2))).status, 200);

  // Window: 40 requests / 10 min per user (the previous in-memory defaults).
  await db.exec("update usage_private.plan_models set allowed_models = array['gpt-6-luna'] where plan = 'free'");
  await db.exec(`insert into usage_private.ai_usage_requests (user_id, feature, environment, status, images_requested, created_at, finished_at)
    select '${ids.free}', 'ai_image_naming', 'test', 'succeeded', 1, now() - interval '1 minute', now() from generate_series(1, 40)`);
  const limited = await instances[1].handler(post(batch(11, 1), ids.free));
  assert.equal(limited.status, 429);
  const limitedBody = await limited.json();
  assert.equal(limitedBody.error.code, 'rate_limited');
  assert.ok(limitedBody.error.retryAfterSeconds >= 1);
  assert.equal(limited.headers.get('retry-after'), String(limitedBody.error.retryAfterSeconds));

  // Plan quota: off by default; once enabled, Pro = 8 images per Vietnam day.
  await db.exec(`insert into usage_private.plan_quotas (plan, daily_image_limit) values ('pro', 8);`);
  assert.equal((await instances[0].handler(post(batch(20, 6), ids.pro2))).status, 200, 'quota not enforced yet');
  await db.exec('update usage_private.settings set quota_enforced = true');
  const over = await instances[0].handler(post(batch(21, 6), ids.pro2));
  assert.equal(over.status, 429);
  const overBody = await over.json();
  assert.equal(overBody.error.code, 'AI_QUOTA_EXCEEDED');
  // 6 + 1 + the 2 lost requests (swept to unknown): images that may have reached the provider are never refunded.
  assert.deepEqual(overBody.error.quota, { scope: 'daily', limit: 8, used: 9 });
  assert.match(overBody.error.message, /8 ảnh .* ngày/);
  await db.exec(`insert into usage_private.user_quota_overrides (user_id, unlimited) values ('${ids.pro2}', true)`);
  assert.equal((await instances[0].handler(post(batch(22, 6), ids.pro2))).status, 200, 'override wins');

  // Kill switch: new requests stop, a finished request can still be replayed.
  const before = shared.openai;
  await db.exec("update usage_private.settings set ai_enabled = false, paused_reason = 'Kiểm tra chi phí'");
  const paused = await instances[1].handler(post(batch(30, 1), ids.pro2));
  assert.equal(paused.status, 503);
  assert.equal((await paused.json()).error.code, 'AI_USAGE_PAUSED');
  assert.equal((await instances[1].handler(post(batch(22, 6), ids.pro2))).status, 200, 'replay while paused');
  assert.equal(shared.openai, before);

  const rejected = await rows(db, "select error_code, count(*)::int as n from usage_private.ai_usage_requests where status = 'rejected' group by 1 order by 1");
  assert.deepEqual(rejected, [
    { error_code: 'AI_QUOTA_EXCEEDED', n: 1 },
    { error_code: 'AI_USAGE_PAUSED', n: 1 },
    { error_code: 'rate_limited', n: 1 },
    { error_code: 'too_many_concurrent', n: 1 },
  ]);
  assert.equal((await rows(db, "select count(*)::int as n from usage_private.ai_usage_attempts a join usage_private.ai_usage_requests r on r.id = a.request_id where r.status = 'rejected'"))[0].n, 0,
    'refusals never get a provider attempt');
});

test('refusals after authentication are recorded for the verified user; 401 is not', async (t) => {
  const db = await createUsageDb(t);
  const { handler, calls } = createInstance(db, { denied: [ids.free] });
  assert.equal((await handler(post(batch(1, 1), ids.free))).status, 403);
  assert.equal((await handler(post({ ...batch(2, 1), images: [] }))).status, 400);
  assert.equal((await handler(post(batch(3, 1), null))).status, 401);
  // A spoofed user in the body changes nothing.
  assert.equal((await handler(post({ ...batch(4, 1), userId: ids.admin, user_id: ids.admin }, ids.free))).status, 403);
  assert.equal(calls.openai, 0);

  const recorded = await rows(db, "select user_id, error_code, http_status from usage_private.ai_usage_requests order by created_at");
  assert.deepEqual(recorded.map((r) => [r.user_id, r.error_code, r.http_status]), [
    [ids.free, 'AI_NAMING_ACCESS_DENIED', 403],
    [ids.pro, 'invalid_request', 400],
    [ids.free, 'AI_NAMING_ACCESS_DENIED', 403],
  ]);
});

test('ledger rows hold no key, token, image, prompt or product name; key alias cannot be a secret', async (t) => {
  const db = await createUsageDb(t);
  const { handler, calls } = createInstance(db, { openai: [rateLimited, named()] });
  await handler(post(batch(1, 2)));
  const dump = JSON.stringify(await rows(db, `
    select (select json_agg(r) from usage_private.ai_usage_requests r) as requests,
           (select json_agg(a) from usage_private.ai_usage_attempts a) as attempts`));
  for (const secret of [FAKE_KEY, 'QQQQ', 'BÍ-MẬT-PROMPT', PRODUCT, 'may-khoan-bosch', 'jwt:']) {
    assert.ok(!dump.includes(secret), `ledger must not contain ${secret}`);
  }
  assert.ok(!JSON.stringify(calls.logs).includes(FAKE_KEY));
  // The idempotency table keeps only a 64-hex HMAC and the short-lived replay.
  const [idem] = await rows(db, 'select fingerprint, replay_expires_at > now() as fresh from usage_private.ai_idempotency');
  assert.match(idem.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(!idem.fingerprint.includes('Q'));
  assert.equal(idem.fresh, true);

  for (const alias of [FAKE_KEY, 'sk-proj-abc', FAKE_KEY.slice(3, 20).toLowerCase()]) {
    const instance = createInstance(db, { env: { OPENAI_IMAGE_NAME_KEY_ALIAS: alias } });
    await instance.handler(post({ ...batch(50, 1), requestId: undefined }));
    assert.ok(instance.calls.logs.some(([message]) => /KEY_ALIAS ignored/.test(message)));
  }
  const aliases = await rows(db, 'select distinct key_alias from usage_private.ai_usage_requests order by 1');
  assert.deepEqual(aliases.map((row) => row.key_alias), ['image-naming-test-v1', 'invalid-alias']);
});

test('pricing: unknown model stays unpriced; a later price change never rewrites history', async (t) => {
  const db = await createUsageDb(t);
  const { handler } = createInstance(db, {
    openai: [named(), named({ model: 'gpt-6.1-sol' }), named({ tier: 'priority' })],
    env: { OPENAI_IMAGE_NAME_MODEL: 'gpt-6-luna' },
  });
  for (const n of [1, 2, 3]) assert.equal((await handler(post(batch(n, 1)))).status, 200);

  const costs = async () => rows(db, `select r.client_request_id, a.cost_status, a.estimated_cost_usd::text as cost, a.price_version
    from usage_private.ai_usage_attempts a join usage_private.ai_usage_requests r on r.id = a.request_id order by r.client_request_id`);
  let current = await costs();
  assert.deepEqual(current.map((c) => [c.cost_status, c.cost]), [
    ['estimated', '0.0001470000'],
    ['unpriced', null], // model without a price: tokens kept, cost unknown, the feature still works
    ['unpriced', null], // tier without a price
  ]);

  // Admin adds a new gpt-6-luna price and a first gpt-6.1-sol price (backfilling only unpriced attempts).
  const change = (payload) => queryAs(db, 'authenticated', ids.admin, "select public.admin_usage_config_change('price.add', $1::jsonb) as r", [JSON.stringify(payload)]);
  await change({ model: 'gpt-6-luna', max_input_tokens: 272000, input_usd_per_mtok: 1, cached_input_usd_per_mtok: 1, cache_write_usd_per_mtok: 1, output_usd_per_mtok: 1, version: 'test-v2', backfill_unpriced: true });
  const { rows: [{ r: sol }] } = await change({ model: 'gpt-6.1-sol', input_usd_per_mtok: 2, cached_input_usd_per_mtok: 0.2, output_usd_per_mtok: 8, version: 'sol-v1',
    effective_from: new Date(Date.now() - 3600_000).toISOString(), backfill_unpriced: true });
  assert.equal(sol.backfilled, 1);

  current = await costs();
  assert.equal(current[0].cost, '0.0001470000', 'already estimated attempts keep their snapshot');
  assert.equal(current[0].price_version, 'openai-pricing-2026-10-18');
  // (1000 × 2 + 200 × 0.2 + 90 × 8) / 1M
  assert.deepEqual([current[1].cost_status, current[1].cost, current[1].price_version], ['estimated', '0.0027600000', 'sol-v1']);
  assert.equal(current[2].cost_status, 'unpriced');

  await assert.rejects(change({ model: 'gpt-6-luna', max_input_tokens: 272000, input_usd_per_mtok: 3, output_usd_per_mtok: 3, version: 'past',
    effective_from: '2026-01-01T00:00:00Z' }), /chỉ thêm được giá mới cho tương lai/);
  const audit = await rows(db, "select action, actor_id from usage_private.config_audit order by id");
  assert.deepEqual(audit.map((a) => [a.action, a.actor_id]), [['price.add', ids.admin], ['price.add', ids.admin]]);
});
