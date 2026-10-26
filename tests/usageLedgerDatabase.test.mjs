// Usage migrations against real SQL in PGlite: grants and RLS as Supabase
// roles, activity ingestion, dashboard aggregates, Vietnam day boundaries,
// keyset pagination, audited configuration and query plans on a large fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createUsageDb, ids, queryAs, serviceRpc } from './fixtures/usageDb.mjs';

const VISITOR = 'cccccccc-0000-4000-8000-000000000001';
const VISITOR_2 = 'cccccccc-0000-4000-8000-000000000002';

const event = (overrides = {}) => ({
  schemaVersion: 1,
  eventId: randomUUID(),
  operationId: randomUUID(),
  imageBatchId: randomUUID(),
  feature: 'watermark',
  action: 'image.create',
  sourcePage: 'watermark',
  status: 'succeeded',
  requestedCount: 1,
  succeededCount: 1,
  failedCount: 0,
  skippedCount: 0,
  cancelledCount: 0,
  subjectUserId: null,
  visitorId: VISITOR,
  occurredAt: new Date().toISOString(),
  ...overrides,
});

async function log(db, role, userId, events) {
  const { rows: [row] } = await queryAs(db, role, userId, 'select public.usage_log_activity($1::jsonb) as r', [JSON.stringify(events)]);
  return row.r;
}

async function admin(db, fn, ...params) {
  const placeholders = params.map((_, index) => `$${index + 1}`).join(', ');
  const { rows: [row] } = await queryAs(db, 'authenticated', ids.admin, `select public.${fn}(${placeholders}) as r`, params);
  return row.r;
}

const range = (from, to) => [from, to];
const wide = () => range(new Date(Date.now() - 86400_000).toISOString(), new Date(Date.now() + 86400_000).toISOString());

async function accepted(db, user, images = 1, extra = {}) {
  const begin = await serviceRpc(db, 'ai_usage_begin', {
    user_id: user, images_requested: images, environment: 'production', key_alias: 'image-naming-prod-v1', requested_model: 'gpt-6-luna', ...extra,
  });
  assert.equal(begin.decision, 'accepted');
  return begin.request_id;
}

async function attempt(db, requestId, number, overrides = {}) {
  return serviceRpc(db, 'ai_usage_attempt_finish', {
    request_id: requestId, attempt_number: number, status: 'succeeded', http_status: 200, usage_status: 'reported',
    resolved_model: 'gpt-6-luna', started_at: new Date().toISOString(), latency_ms: 900,
    usage: { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100, reasoning_tokens: 0, total_tokens: 1100 },
    ...overrides,
  });
}

async function finish(db, requestId, overrides = {}) {
  return serviceRpc(db, 'ai_usage_finish', { request_id: requestId, status: 'succeeded', http_status: 200, images_succeeded: 1, images_failed: 0, needs_review_count: 0, ...overrides });
}

// ── Access control ─────────────────────────────────────────────────────────

test('browsers (anon, users, admins) cannot read or write the ledger directly', async (t) => {
  const db = await createUsageDb(t);
  const requestId = await accepted(db, ids.pro);

  for (const [role, user] of [['anon', ''], ['authenticated', ids.pro], ['authenticated', ids.admin]]) {
    await assert.rejects(queryAs(db, role, user, 'select * from usage_private.ai_usage_requests'), /permission denied for (schema usage_private|table ai_usage_requests)/, `${role} select`);
    await assert.rejects(queryAs(db, role, user, `insert into usage_private.ai_usage_attempts (request_id, attempt_number, status, started_at, usage_status, cost_status)
      values ('${requestId}', 9, 'succeeded', now(), 'not_called', 'not_applicable')`), /permission denied/, `${role} insert`);
    await assert.rejects(queryAs(db, role, user, 'select usage_private.ai_begin($1::jsonb)', ['{}']), /permission denied/);
    for (const fn of ['ai_usage_begin', 'ai_usage_attempt_start', 'ai_usage_attempt_finish', 'ai_usage_finish', 'ai_usage_record_rejection']) {
      await assert.rejects(queryAs(db, role, user, `select public.${fn}($1::jsonb)`, [JSON.stringify({ request_id: requestId, user_id: user || ids.pro })]),
        /permission denied for function/, `${role} ${fn}`);
    }
  }
});

test('admin RPCs: anon cannot execute, a regular user is refused by the server-side admin check', async (t) => {
  const db = await createUsageDb(t);
  const [from, to] = wide();
  const calls = [
    ['select public.admin_usage_overview($1, $2)', [from, to]],
    ['select public.admin_usage_activity($1, $2)', [from, to]],
    ['select public.admin_usage_requests($1, $2)', [from, to]],
    ['select public.admin_usage_request_detail($1)', [randomUUID()]],
    ['select public.admin_usage_operation($1)', [randomUUID()]],
    ['select public.admin_usage_config()', []],
    ["select public.admin_usage_config_change('settings.update', '{\"ai_enabled\": false}')", []],
    ['select public.admin_usage_sweep()', []],
  ];
  for (const [sql, params] of calls) {
    await assert.rejects(queryAs(db, 'anon', '', sql, params), /permission denied for function/, sql);
    await assert.rejects(queryAs(db, 'authenticated', ids.pro, sql, params), /Chỉ quản trị viên/, sql);
    // A suspended admin is no admin (public.is_admin()).
    await assert.rejects(queryAs(db, 'authenticated', ids.suspended, sql, params), /Chỉ quản trị viên/, sql);
  }
  // user_metadata-style claims are not consulted: only profiles.role via is_admin().
  await db.exec(`update public.profiles set preferences = '{"role":"admin"}' where id = '${ids.pro}'`);
  await assert.rejects(queryAs(db, 'authenticated', ids.pro, 'select public.admin_usage_config()'), /Chỉ quản trị viên/);
  const { rows: [{ r: settings }] } = await queryAs(db, 'authenticated', ids.pro, "select (select ai_enabled from usage_private.settings) as r").catch(() => ({ rows: [{ r: 'denied' }] }));
  assert.equal(settings, 'denied');
});

test('security definer functions pin search_path; only the activity RPC is open to anon', async (t) => {
  const db = await createUsageDb(t);
  const { rows } = await db.query(`
    select n.nspname || '.' || p.proname as name, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as config,
      has_function_privilege('anon', p.oid, 'execute') as anon_exec,
      has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'usage_private' or p.proname like 'admin_usage%' or p.proname like 'ai_usage%' or p.proname = 'usage_log_activity'`);
  assert.ok(rows.length > 25);
  for (const row of rows.filter((r) => r.prosecdef)) assert.match(row.config, /search_path=/, row.name);
  assert.deepEqual(rows.filter((r) => r.anon_exec).map((r) => r.name), ['public.usage_log_activity']);
  assert.deepEqual(rows.filter((r) => r.name.startsWith('usage_private.') && r.auth_exec).map((r) => r.name).sort(), [
    'usage_private.admin_config_change_with_models',
    'usage_private.admin_config_with_models',
    'usage_private.caller_ai_naming_models',
  ], 'only guarded implementations behind invoker RPCs are executable; ledger internals stay private');
});

// ── Activity telemetry ─────────────────────────────────────────────────────

test('create events: 8 of 10 rendered, stop after 3; invariants enforced; old counter is a separate source', async (t) => {
  const db = await createUsageDb(t);
  await db.exec(await readFile(new URL('../supabase_watermark_image_counts.sql', import.meta.url), 'utf8'));
  const result = await log(db, 'authenticated', ids.pro, [
    event({ subjectUserId: ids.pro, visitorId: null, requestedCount: 10, succeededCount: 8, failedCount: 2, status: 'partial' }),
    event({ subjectUserId: ids.pro, visitorId: null, requestedCount: 10, succeededCount: 3, cancelledCount: 7, status: 'cancelled' }),
    event({ subjectUserId: ids.pro, visitorId: null, requestedCount: 10, succeededCount: 9, failedCount: 2, status: 'partial' }), // 11 > 10
  ]);
  assert.equal(result.accepted, 2);
  assert.deepEqual(result.rejected.map((r) => r.reason), ['invalid']);
  // The page also writes its existing counter once per batch (successful images only).
  await db.exec(`insert into public.watermark_image_counts (user_id, visitor_id, image_count) values ('${ids.pro}', '${VISITOR}', 8), ('${ids.pro}', '${VISITOR}', 3)`);

  const o = await admin(db, 'admin_usage_overview', ...wide());
  assert.equal(o.activity.create_operations, 2);
  assert.equal(o.activity.images_created, 11);
  assert.equal(o.activity.images_create_failed, 2);
  assert.equal(o.legacy_watermark_images, 11, 'reference only: shown next to, never added to, the new number');
  assert.equal(o.activity.active_users, 1);
  assert.equal(o.activity.distinct_visitors, 0);
});

test('a resent event is stored once, even when both copies arrive at the same time', async (t) => {
  const db = await createUsageDb(t);
  const same = event();
  assert.equal((await log(db, 'anon', '', [same])).accepted, 1);
  const again = await log(db, 'anon', '', [same]);
  assert.deepEqual([again.accepted, again.duplicates], [0, 1]);
  const twin = event();
  const results = await Promise.all([log(db, 'anon', '', [twin]), log(db, 'anon', '', [twin])]);
  assert.equal(results.reduce((sum, r) => sum + r.accepted, 0), 1);
  const { rows: [{ n }] } = await db.query('select count(*)::int as n from usage_private.usage_activity_events');
  assert.equal(n, 2);
});

test('subject is fixed when the task starts; guests are never linked to an account', async (t) => {
  const db = await createUsageDb(t);
  const own = event({ subjectUserId: ids.pro, visitorId: VISITOR });
  const otherUser = event({ subjectUserId: ids.pro2 });
  const guestBeforeLogin = event({ subjectUserId: null, visitorId: VISITOR_2 });
  const result = await log(db, 'authenticated', ids.pro, [own, otherUser, guestBeforeLogin]);
  assert.equal(result.accepted, 2);
  assert.deepEqual(result.rejected, [{ eventId: otherUser.eventId, reason: 'subject_mismatch' }]);
  // Logged out: a task of the account can no longer be attributed to it.
  const anonClaim = await log(db, 'anon', '', [event({ subjectUserId: ids.pro })]);
  assert.equal(anonClaim.rejected[0].reason, 'subject_mismatch');
  assert.equal((await log(db, 'anon', '', [event({ visitorId: null })])).rejected[0].reason, 'visitor_required');

  const stored = (await db.query('select event_id, subject_type, user_id, visitor_id from usage_private.usage_activity_events')).rows;
  assert.deepEqual(stored.find((r) => r.event_id === own.eventId), { event_id: own.eventId, subject_type: 'user', user_id: ids.pro, visitor_id: null },
    'account events do not keep the browser visitor ID');
  assert.deepEqual(stored.find((r) => r.event_id === guestBeforeLogin.eventId), { event_id: guestBeforeLogin.eventId, subject_type: 'visitor', user_id: null, visitor_id: VISITOR_2 });

  const suspended = await log(db, 'authenticated', ids.suspended, [event({ subjectUserId: ids.suspended })]);
  assert.equal(suspended.rejected[0].reason, 'account_suspended');
});

test('metadata allowlist, payload and volume limits', async (t) => {
  const db = await createUsageDb(t);
  const withMeta = event({
    action: 'ai.naming.apply', feature: 'ai_image_naming', requestedCount: 4, succeededCount: 4,
    aiRunId: randomUUID(), metadata: { ai_unchanged_count: 3, edited_count: 1, stage: 'apply', productName: 'Máy khoan', prompt: 'x'.repeat(2000), nested: { a: 1 } },
  });
  assert.equal((await log(db, 'anon', '', [withMeta])).accepted, 1);
  const { rows: [stored] } = await db.query('select metadata from usage_private.usage_activity_events where event_id = $1', [withMeta.eventId]);
  assert.deepEqual(stored.metadata, { ai_unchanged_count: 3, edited_count: 1, stage: 'apply' });

  const invalid = await log(db, 'anon', '', [
    event({ action: 'image.download', downloadMethod: null }),
    event({ action: 'image.export' }),
    event({ status: 'done' }),
    event({ errorCode: 'Error: <script>' }),
    event({ eventId: 'not-a-uuid' }),
    event({ schemaVersion: 2 }),
    event({ requestedCount: -1 }),
  ]);
  assert.equal(invalid.accepted, 0);
  assert.equal(invalid.rejected.length, 7);
  assert.equal(invalid.rejected.find((r) => r.reason === 'unsupported_schema') !== undefined, true);

  await assert.rejects(log(db, 'anon', '', Array.from({ length: 51 }, () => event())), /too many events/);
  await db.exec('update usage_private.settings set activity_max_events_per_minute = 10');
  assert.equal((await log(db, 'anon', '', Array.from({ length: 8 }, () => event({ visitorId: VISITOR_2 })))).accepted, 8);
  const capped = await log(db, 'anon', '', Array.from({ length: 5 }, () => event({ visitorId: VISITOR_2 })));
  assert.equal(capped.rate_limited, true);
  assert.equal(capped.accepted, 0);
});

test('downloads count images actually handed over, not prepared or cancelled ones', async (t) => {
  const db = await createUsageDb(t);
  const download = (overrides) => event({ action: 'image.download', downloadMethod: 'zip', imageSize: 'original', ...overrides });
  await log(db, 'anon', '', [
    download({ requestedCount: 20, preparedCount: 20, succeededCount: 20, delivery: 'browser_handoff', outputFileCount: 1, imagesInFiles: 20 }),
    download({ requestedCount: 20, preparedCount: 0, succeededCount: 0, cancelledCount: 20, status: 'cancelled', errorCode: 'picker_cancelled' }),
    download({ requestedCount: 20, preparedCount: 12, succeededCount: 0, cancelledCount: 20, status: 'cancelled', outputFileCount: 0 }),
    download({ requestedCount: 5, preparedCount: 5, succeededCount: 5, delivery: 'file_written', outputFileCount: 1, imagesInFiles: 5, imageSize: '800x600' }),
    download({ downloadMethod: 'single', requestedCount: 1, preparedCount: 1, succeededCount: 1, delivery: 'browser_handoff', outputFileCount: 1, imagesInFiles: 1 }),
  ]);
  const o = await admin(db, 'admin_usage_overview', ...wide());
  assert.equal(o.activity.download_operations, 3);
  assert.equal(o.activity.download_cancelled, 2);
  assert.equal(o.activity.images_downloaded, 26);
  assert.equal(o.activity.images_written, 5);
  assert.equal(o.activity.zip_files, 2, 'a ZIP of 20 images is one file, one operation');
});

// ── Dashboard aggregates ───────────────────────────────────────────────────

test('days are cut in Asia/Ho_Chi_Minh around 17:00 UTC, ranges are [from, to)', async (t) => {
  const db = await createUsageDb(t);
  await log(db, 'anon', '', [event(), event(), event()]);
  await db.exec(`
    update usage_private.usage_activity_events set received_at = v.at
    from (select event_id, (array['2026-10-17T16:59:59.999Z', '2026-10-17T17:00:00Z', '2026-10-18T16:59:59Z'])[row_number() over (order by event_id)]::timestamptz as at
          from usage_private.usage_activity_events) v
    where v.event_id = usage_private.usage_activity_events.event_id`);
  const o = await admin(db, 'admin_usage_overview', '2026-10-16T17:00:00Z', '2026-10-18T17:00:00Z');
  assert.deepEqual(o.series.map((point) => [point.day, point.images_created]), [['2026-10-17', 1], ['2026-10-18', 2]]);
  // "Hôm nay" 18/10 (VN) = [17/10 17:00 UTC, 18/10 17:00 UTC)
  const today = await admin(db, 'admin_usage_overview', '2026-10-17T17:00:00Z', '2026-10-18T17:00:00Z');
  assert.equal(today.activity.images_created, 2);
  assert.equal(today.series.length, 1);
  await assert.rejects(admin(db, 'admin_usage_overview', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'), /Khoảng thời gian không hợp lệ/);
  await assert.rejects(admin(db, 'admin_usage_overview', '2025-01-01T00:00:00Z', '2026-10-18T00:00:00Z'), /tối đa 400 ngày/);
});

test('keyset pagination is stable with equal timestamps; export limit is reported', async (t) => {
  const db = await createUsageDb(t);
  for (let index = 0; index < 3; index += 1) await log(db, 'anon', '', Array.from({ length: 40 }, () => event({ visitorId: randomUUID() })));
  await db.exec("update usage_private.usage_activity_events set received_at = now() - interval '1 hour'");

  const seen = new Set();
  let cursor = null;
  let pages = 0;
  do {
    const page = await admin(db, 'admin_usage_activity', ...wide(), '{}', cursor ? JSON.stringify(cursor) : null, 50);
    page.rows.forEach((row) => seen.add(row.event_id));
    cursor = page.next_cursor;
    pages += 1;
    assert.equal(page.has_more, Boolean(cursor));
  } while (cursor);
  assert.equal(pages, 3);
  assert.equal(seen.size, 120);

  const capped = await admin(db, 'admin_usage_activity', ...wide(), '{}', null, 100);
  assert.deepEqual([capped.rows.length, capped.has_more], [100, true]);
  const huge = await admin(db, 'admin_usage_activity', ...wide(), '{}', null, 1_000_000);
  assert.deepEqual([huge.rows.length, huge.has_more], [120, false], 'limit is clamped server-side (≤ 5000)');
});

test('overview: totals by layer, top users, errors, cohort apply rate, budgets, filters', async (t) => {
  const db = await createUsageDb(t);
  const runA = randomUUID();
  // pro: two requests in one run, second retried once.
  const r1 = await accepted(db, ids.pro, 6, { ai_run_id: runA });
  await attempt(db, r1, 1);
  await finish(db, r1, { images_succeeded: 6 });
  const r2 = await accepted(db, ids.pro, 2, { ai_run_id: runA });
  await attempt(db, r2, 1, { status: 'failed', http_status: 503, usage_status: 'missing', usage: null, error_code: 'upstream_error', will_retry: true, retry_reason: 'server_error' });
  await attempt(db, r2, 2);
  await finish(db, r2, { status: 'partial', images_succeeded: 1, images_failed: 1, needs_review_count: 1, error_code: 'missing' });
  // pro2: a more expensive request on another key alias.
  const r3 = await accepted(db, ids.pro2, 1, { key_alias: 'image-naming-staging-v1', environment: 'staging' });
  await attempt(db, r3, 1, { usage: { input_tokens: 10000, cached_input_tokens: 0, output_tokens: 1000, reasoning_tokens: 0, total_tokens: 11000 } });
  await finish(db, r3);
  await serviceRpc(db, 'ai_usage_record_rejection', { user_id: ids.free, code: 'AI_NAMING_ACCESS_DENIED', http_status: 403, environment: 'production', images_requested: 0 });

  await log(db, 'authenticated', ids.pro, [event({
    subjectUserId: ids.pro, visitorId: null, action: 'ai.naming.apply', feature: 'ai_image_naming', aiRunId: runA,
    requestedCount: 7, succeededCount: 7, metadata: { ai_unchanged_count: 5, edited_count: 2 },
  })]);
  await admin(db, 'admin_usage_config_change', 'budget.upsert', JSON.stringify({ scope: 'global', monthly_limit_usd: 0.001 }));
  await admin(db, 'admin_usage_config_change', 'budget.upsert', JSON.stringify({ scope: 'key_alias', scope_value: 'image-naming-prod-v1', monthly_limit_usd: 1, alert_thresholds: [50, 80] }));

  const o = await admin(db, 'admin_usage_overview', ...wide());
  assert.equal(o.ai.requests, 3);
  assert.equal(o.ai.rejected, 1);
  assert.equal(o.ai.runs, 1);
  assert.equal(o.ai.attempts, 4);
  assert.equal(o.ai.requests_with_retry, 1);
  assert.equal(o.ai.images_requested, 9);
  assert.equal(o.ai.provider_image_sends, 11);
  assert.equal(o.ai.images_succeeded, 8);
  assert.equal(o.ai.needs_review, 1);
  // (1000×0.10 + 100×0.50)/1M = 0.00015 ×2, + (10000×0.10 + 1000×0.50)/1M = 0.0015
  assert.equal(Number(o.ai.estimated_cost_usd).toFixed(6), '0.001800');
  assert.equal(o.ai.attempts_usage_missing, 1);
  assert.deepEqual(o.top_users.map((u) => [u.email, u.requests, u.attempts]), [['pro2@example.com', 1, 1], ['pro@example.com', 2, 3]]);
  assert.ok(o.request_errors.some((e) => e.status === 'rejected' && e.code === 'AI_NAMING_ACCESS_DENIED'));
  assert.ok(o.attempt_errors.some((e) => e.code === 'upstream_error'));
  assert.deepEqual(o.apply_cohort, { runs: 1, runs_open: 0, runs_applied: 1, suggested: 7, applied_unchanged: 5, applied_total: 7 });
  const [globalBudget, aliasBudget] = o.budgets;
  assert.equal(globalBudget.scope, 'global');
  assert.equal(globalBudget.level, 100, 'soft alert at 100% (never a hard cap)');
  assert.equal(aliasBudget.level, null);
  assert.ok(o.options.key_aliases.includes('image-naming-staging-v1'));

  const filtered = await admin(db, 'admin_usage_overview', ...wide(), JSON.stringify({ user: 'pro2@example.com' }));
  assert.equal(filtered.ai.requests, 1);
  const byAlias = await admin(db, 'admin_usage_overview', ...wide(), JSON.stringify({ keyAlias: 'image-naming-prod-v1', status: 'partial' }));
  assert.equal(byAlias.ai.requests, 1);
  const unknownUser = await admin(db, 'admin_usage_overview', ...wide(), JSON.stringify({ user: 'nobody@example.com' }));
  assert.equal(unknownUser.ai.requests, 0);

  // Lookups by any of the IDs, and the detail view with every attempt.
  const [{ provider_request_id: providerId }] = (await db.query("update usage_private.ai_usage_attempts set provider_request_id = 'req_lookup' where request_id = $1 and attempt_number = 2 returning provider_request_id", [r2])).rows;
  const lookup = await admin(db, 'admin_usage_requests', null, null, JSON.stringify({ requestId: providerId }));
  assert.deepEqual(lookup.rows.map((row) => row.id), [r2]);
  const detail = await admin(db, 'admin_usage_request_detail', r2);
  assert.deepEqual(detail.attempts.map((a) => [a.attempt_number, a.status, a.retry_reason]), [[1, 'failed', 'server_error'], [2, 'succeeded', null]]);
  const run = await admin(db, 'admin_usage_operation', runA);
  assert.equal(run.requests.length, 2);
  assert.equal(run.events.length, 1);
});

test('configuration changes are admin-only, validated and audited', async (t) => {
  const db = await createUsageDb(t);
  await admin(db, 'admin_usage_config_change', 'settings.update', JSON.stringify({ max_concurrent_per_user: 3, ai_enabled: false, paused_reason: 'Bảo trì' }));
  await assert.rejects(admin(db, 'admin_usage_config_change', 'settings.update', JSON.stringify({ tracking_started_at: '2020-01-01' })), /Không thể đổi thiết lập/);
  await assert.rejects(admin(db, 'admin_usage_config_change', 'settings.update', JSON.stringify({ max_concurrent_per_user: 0 })), /check/);
  await admin(db, 'admin_usage_config_change', 'plan_quota.upsert', JSON.stringify({ plan: 'pro', daily_image_limit: 300, monthly_image_limit: 5000 }));
  await admin(db, 'admin_usage_config_change', 'user_quota.upsert', JSON.stringify({ user: 'pro2@example.com', daily_image_limit: 1000, note: 'Khách lớn' }));
  await assert.rejects(admin(db, 'admin_usage_config_change', 'user_quota.upsert', JSON.stringify({ user: 'ghost@example.com' })), /Không tìm thấy người dùng/);
  await assert.rejects(admin(db, 'admin_usage_config_change', 'budget.upsert', JSON.stringify({ scope: 'global', monthly_limit_usd: 5, alert_thresholds: [0] })), /check/);
  await assert.rejects(admin(db, 'admin_usage_config_change', 'drop.everything', '{}'), /Thao tác không hợp lệ/);

  const config = await admin(db, 'admin_usage_config');
  assert.equal(config.settings.max_concurrent_per_user, 3);
  assert.equal(config.settings.ai_enabled, false);
  assert.equal(config.user_quotas[0].email, 'pro2@example.com');
  assert.equal(config.prices.length, 4, 'verified seed prices');
  const audit = [...config.audit].reverse();
  assert.deepEqual(audit.map((entry) => entry.action), ['settings.update', 'plan_quota.upsert', 'user_quota.upsert']);
  assert.deepEqual(audit[0].before_value.max_concurrent_per_user, 2);
  assert.deepEqual(audit[0].after_value.max_concurrent_per_user, 3);
  assert.equal(audit[0].actor_email, 'admin@example.com');

  // Paused: the backend refuses new requests.
  const paused = await serviceRpc(db, 'ai_usage_begin', { user_id: ids.pro, images_requested: 1, environment: 'test' });
  assert.deepEqual([paused.decision, paused.code], ['rejected', 'AI_USAGE_PAUSED']);
});

test('deleting an account keeps the totals, anonymized; idempotency data goes with it', async (t) => {
  const db = await createUsageDb(t);
  const requestId = await accepted(db, ids.pro, 2, { client_request_id: randomUUID(), fingerprint: 'a'.repeat(64) });
  await attempt(db, requestId, 1);
  await finish(db, requestId, { images_succeeded: 2 });
  await log(db, 'authenticated', ids.pro, [event({ subjectUserId: ids.pro, visitorId: null })]);
  const before = await admin(db, 'admin_usage_overview', ...wide());

  await db.exec(`delete from public.profiles where id = '${ids.pro}'; delete from auth.users where id = '${ids.pro}';`);
  const after = await admin(db, 'admin_usage_overview', ...wide());
  assert.equal(after.ai.estimated_cost_usd, before.ai.estimated_cost_usd);
  assert.equal(after.activity.images_created, before.activity.images_created);
  assert.deepEqual(after.top_users.map((u) => [u.user_id, u.email]), [[null, null]], 'no email/name snapshot survives');
  const { rows: [{ n }] } = await db.query('select count(*)::int as n from usage_private.ai_idempotency');
  assert.equal(n, 0);
});

test('query plans use the time / user indexes on a large fixture', async (t) => {
  const db = await createUsageDb(t, { rerun: false });
  await db.exec(`
    insert into usage_private.ai_usage_requests (user_id, feature, environment, key_alias, requested_model, status, images_requested, created_at, finished_at)
    select (array['${ids.pro}', '${ids.pro2}', '${ids.free}', '${ids.admin}']::uuid[])[1 + (g % 4)], 'ai_image_naming', 'production',
      'image-naming-prod-v1', 'gpt-6-luna', 'succeeded', 6, now() - (g || ' minutes')::interval, now()
    from generate_series(1, 60000) g;
    insert into usage_private.ai_usage_attempts (request_id, attempt_number, status, started_at, usage_status, input_tokens, output_tokens, cost_status, estimated_cost_usd)
    select id, 1, 'succeeded', created_at, 'reported', 1000, 100, 'estimated', 0.00015 from usage_private.ai_usage_requests;
    insert into usage_private.usage_activity_events (event_id, operation_id, subject_type, visitor_id, feature, action, source_page, status, succeeded_count, schema_version, received_at)
    select gen_random_uuid(), gen_random_uuid(), 'visitor', gen_random_uuid(), 'watermark', 'image.create', 'watermark', 'succeeded', 5, 1, now() - (g || ' minutes')::interval
    from generate_series(1, 60000) g;
    analyze;
  `);
  const plan = async (sql) => (await db.query(`explain ${sql}`)).rows.map((row) => row['QUERY PLAN']).join('\n');
  const day = "now() - interval '1 day', now()";

  const requestsPlan = await plan(`select count(*) from usage_private.filtered_requests(${day}, null, '{}'::jsonb)`);
  assert.match(requestsPlan, /ai_usage_requests_created_idx/);
  const userPlan = await plan(`select count(*) from usage_private.filtered_requests(${day}, '${ids.pro}', '{}'::jsonb)`);
  assert.match(userPlan, /ai_usage_requests_user_created_idx/);
  const eventsPlan = await plan(`select count(*) from usage_private.filtered_events(${day}, null, '{}'::jsonb)`);
  assert.match(eventsPlan, /usage_activity_events_received_idx/);
  const joinPlan = await plan(`select sum(a.estimated_cost_usd) from usage_private.ai_usage_attempts a
    join usage_private.filtered_requests(${day}, null, '{}'::jsonb) r on r.id = a.request_id`);
  assert.match(joinPlan, /ai_usage_attempts_request_id_attempt_number_key|Hash Join/);

  const started = performance.now();
  const o = await admin(db, 'admin_usage_overview', new Date(Date.now() - 7 * 86400_000).toISOString(), new Date().toISOString());
  const elapsed = performance.now() - started;
  assert.ok(o.ai.requests > 9000);
  t.diagnostic(`7-day overview over 60k requests + 60k attempts + 60k events: ${Math.round(elapsed)} ms (PGlite, single process)`);
  t.diagnostic(`filtered_requests plan:\n${requestsPlan}`);
});

test('request window: admins and Pro+ plans are exempt, free accounts keep it; quota and concurrency still apply', async (t) => {
  const db = await createUsageDb(t);
  const exempt = async (user) => (await db.query('select usage_private.rate_window_exempt($1) as r', [user])).rows[0].r;
  await db.exec(`insert into auth.users(id) values ('40000000-0000-4000-8000-000000000001');
    insert into public.profiles(id, role, status, plan) values ('40000000-0000-4000-8000-000000000001', 'user', 'active', 'enterprise');`);
  assert.equal(await exempt(ids.admin), true, 'admin on the free plan');
  assert.equal(await exempt(ids.pro), true);
  assert.equal(await exempt('40000000-0000-4000-8000-000000000001'), true, 'enterprise');
  assert.equal(await exempt(ids.free), false);
  assert.equal(await exempt(ids.suspended), false, 'suspended Pro');
  assert.equal(await exempt(randomUUID()), false, 'no profile');
  await assert.rejects(queryAs(db, 'authenticated', ids.pro, 'select usage_private.rate_window_exempt($1)', [ids.pro]), /permission denied/);

  // A full window (40 requests in the last minute) for each user.
  for (const user of [ids.pro, ids.free, ids.admin]) {
    await db.exec(`insert into usage_private.ai_usage_requests (user_id, feature, environment, status, images_requested, created_at, finished_at)
      select '${user}', 'ai_image_naming', 'test', 'succeeded', 6, now() - interval '1 minute', now() from generate_series(1, 40)`);
  }
  const begin = (user, images = 6) => serviceRpc(db, 'ai_usage_begin', { user_id: user, images_requested: images, environment: 'test' });
  assert.equal((await begin(ids.free)).code, 'rate_limited');
  const proBegin = await begin(ids.pro);
  assert.equal(proBegin.decision, 'accepted', 'Pro is not windowed');
  assert.equal((await begin(ids.admin)).decision, 'accepted', 'admin is not windowed');

  // Concurrency: the accepted request is still running; max 2 per user.
  assert.equal((await begin(ids.pro)).decision, 'accepted');
  assert.equal((await begin(ids.pro)).code, 'too_many_concurrent');
  await db.exec(`update usage_private.ai_usage_requests set status = 'succeeded', finished_at = now() where user_id = '${ids.pro}' and status = 'running'`);

  // Quota still enforced when enabled.
  await db.exec(`insert into usage_private.plan_quotas (plan, daily_image_limit) values ('pro', 250) on conflict (plan) do update set daily_image_limit = 250;
    update usage_private.settings set quota_enforced = true`);
  const over = await begin(ids.pro);
  assert.equal(over.code, 'AI_QUOTA_EXCEEDED');
  assert.equal(over.quota.used, 252);
});
