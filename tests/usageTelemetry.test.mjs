// Browser side of the activity telemetry: event builders, the batch download
// runner and the best-effort delivery queue. No network, no credentials
// (src/lib/supabase.js is swapped for a fixture by tests/aiRenameLoader.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApplyEvents,
  buildCreateEvent,
  buildDownloadEvent,
  buildSingleDownloadEvent,
  createSubject,
} from '../src/utils/usageEvents.js';
import { runBatchDownload } from '../src/utils/watermarkDownload.js';
import { summarizeAppliedNames } from '../src/utils/aiImageNaming.js';
import { TELEMETRY_LIMITS, createTelemetryQueue } from '../src/services/usageTelemetryService.js';

const USER_A = '20000000-0000-4000-8000-00000000000a';
const USER_B = '20000000-0000-4000-8000-00000000000b';
const VISITOR = 'cccccccc-0000-4000-8000-000000000001';
const guest = createSubject(null, VISITOR);
const signedIn = createSubject(USER_A, VISITOR);
const sum = (event) => (event.succeededCount || 0) + (event.failedCount || 0) + (event.skippedCount || 0) + (event.cancelledCount || 0);

test('create events: 8 of 10 rendered, stopped after 3, unreadable files skipped', () => {
  const partial = buildCreateEvent({ subject: signedIn, imageBatchId: 'b', requested: 10, succeeded: 8, failed: 2, skipped: 0, cancelled: 0, aborted: false, durationMs: 1234.4 });
  assert.equal(partial.status, 'partial');
  assert.deepEqual([partial.requestedCount, partial.succeededCount, partial.failedCount], [10, 8, 2]);
  assert.equal(partial.durationMs, 1234);
  assert.equal(partial.subjectUserId, USER_A);
  assert.equal(partial.visitorId, null, 'account events do not carry the browser visitor ID');

  const stopped = buildCreateEvent({ subject: guest, requested: 10, succeeded: 3, failed: 0, skipped: 0, cancelled: 7, aborted: true });
  assert.equal(stopped.status, 'cancelled');
  assert.deepEqual([stopped.succeededCount, stopped.cancelledCount, stopped.failedCount], [3, 7, 0], 'not run ≠ failed');
  assert.equal(stopped.visitorId, VISITOR);

  const skipped = buildCreateEvent({ subject: guest, requested: 5, succeeded: 4, failed: 0, skipped: 1, cancelled: 0, aborted: false });
  assert.equal(skipped.status, 'partial');
  const none = buildCreateEvent({ subject: guest, requested: 2, succeeded: 0, failed: 2, skipped: 0, cancelled: 0, aborted: false });
  assert.equal(none.status, 'failed');
  for (const event of [partial, stopped, skipped, none]) {
    assert.equal(sum(event), event.requestedCount);
    assert.equal(event.schemaVersion, 1);
    assert.match(event.eventId, /^[0-9a-f-]{36}$/);
  }
});

// ── Download runner ────────────────────────────────────────────────────────

class FakeZip {
  static instances = [];
  constructor() { this.files = []; FakeZip.instances.push(this); }
  file(name, blob) { this.files.push([name, blob]); }
  async generateAsync() { if (FakeZip.failPack) throw new Error('Không thể đóng gói'); return { zip: this.files.length }; }
}

function downloadSetup({ count = 3, failPrepareAt = null, cancelAt = null } = {}) {
  const triggered = [];
  const prepared = [];
  const task = { cancelled: false };
  const items = Array.from({ length: count }, (_, index) => ({ blob: { index } }));
  return {
    task,
    triggered,
    prepared,
    input: {
      items,
      names: items.map((_, index) => `anh-${index + 1}.jpg`),
      task,
      prepare: async (item) => {
        if (item.blob.index === failPrepareAt) throw new Error('Không đọc được ảnh');
        prepared.push(item.blob.index);
        if (item.blob.index === cancelAt) task.cancelled = true;
        return item.blob;
      },
      triggerDownload: (blob, name) => triggered.push(name),
      loadZip: async () => FakeZip,
      streamZip: async () => true,
      zipName: () => 'watermark.zip',
      pause: async () => {},
    },
  };
}

const eventFor = (outcome, method, requested, extra = {}) =>
  buildDownloadEvent({ subject: guest, imageBatchId: 'b', method, imageSize: 'original', requested, outcome, ...extra });

test('direct download: every image handed to the browser, one file each', async () => {
  const { input, triggered } = downloadSetup({ count: 3 });
  const outcome = await runBatchDownload({ ...input, method: 'direct' });
  assert.deepEqual(triggered, ['anh-1.jpg', 'anh-2.jpg', 'anh-3.jpg']);
  const event = eventFor(outcome, 'direct', 3);
  assert.deepEqual([event.status, event.preparedCount, event.succeededCount, event.outputFileCount, event.delivery], ['succeeded', 3, 3, 3, 'browser_handoff']);
  const single = buildSingleDownloadEvent({ subject: guest, imageBatchId: 'b' });
  assert.deepEqual([single.downloadMethod, single.succeededCount, single.delivery, single.imageSize], ['single', 1, 'browser_handoff', 'original']);
});

test('ZIP of 20 images = 1 operation, 1 file, 20 images; File System Access only counts after close', async () => {
  const blobZip = downloadSetup({ count: 20 });
  const handoff = await runBatchDownload({ ...blobZip.input, method: 'zip' });
  assert.deepEqual(blobZip.triggered, ['watermark.zip']);
  const handoffEvent = eventFor(handoff, 'zip', 20);
  assert.deepEqual([handoffEvent.outputFileCount, handoffEvent.imagesInFiles, handoffEvent.delivery], [1, 20, 'browser_handoff']);

  const written = downloadSetup({ count: 20 });
  const outcome = await runBatchDownload({ ...written.input, method: 'zip', fileHandle: {}, streamZip: async () => true });
  assert.deepEqual(written.triggered, [], 'streamed to the chosen file, no anchor download');
  assert.equal(eventFor(outcome, 'zip', 20).delivery, 'file_written');

  // Stream stopped before close: nothing was written.
  const aborted = downloadSetup({ count: 20 });
  const stopped = await runBatchDownload({ ...aborted.input, method: 'zip', fileHandle: {}, streamZip: async () => false });
  const stoppedEvent = eventFor(stopped, 'zip', 20);
  assert.deepEqual([stoppedEvent.status, stoppedEvent.preparedCount, stoppedEvent.succeededCount, stoppedEvent.cancelledCount, stoppedEvent.delivery],
    ['cancelled', 20, 0, 20, null], 'images added to an unreleased ZIP are not downloaded');
});

test('resize 800x600, cancel mid-way, closing the save dialog', async () => {
  const resized = downloadSetup({ count: 2 });
  const outcome = await runBatchDownload({ ...resized.input, method: 'zip' });
  const event = buildDownloadEvent({ subject: guest, method: 'zip', imageSize: '800x600', requested: 2, outcome });
  assert.equal(event.imageSize, '800x600');

  const cancelled = downloadSetup({ count: 5, cancelAt: 1 });
  const zipOutcome = await runBatchDownload({ ...cancelled.input, method: 'zip' });
  assert.deepEqual(cancelled.triggered, []);
  const zipEvent = eventFor(zipOutcome, 'zip', 5);
  assert.deepEqual([zipEvent.status, zipEvent.preparedCount, zipEvent.succeededCount], ['cancelled', 2, 0]);

  const direct = downloadSetup({ count: 5, cancelAt: 2 });
  const directEvent = eventFor(await runBatchDownload({ ...direct.input, method: 'direct' }), 'direct', 5);
  assert.deepEqual([directEvent.status, directEvent.succeededCount, directEvent.cancelledCount], ['cancelled', 3, 2]);

  // The page records the picker cancellation without starting the runner.
  const picker = eventFor({ prepared: 0, delivered: 0, outputFiles: 0, delivery: null, cancelled: true, error: null }, 'zip', 5, { errorCode: 'picker_cancelled' });
  assert.deepEqual([picker.status, picker.succeededCount, picker.errorCode], ['cancelled', 0, 'picker_cancelled']);
});

test('prepare, pack and write failures are reported with their stage, never thrown', async () => {
  const prep = downloadSetup({ count: 4, failPrepareAt: 2 });
  const direct = await runBatchDownload({ ...prep.input, method: 'direct' });
  assert.equal(direct.error.message, 'Không đọc được ảnh');
  const directEvent = eventFor(direct, 'direct', 4);
  assert.deepEqual([directEvent.status, directEvent.succeededCount, directEvent.failedCount, directEvent.errorCode], ['partial', 2, 2, 'prepare_failed']);

  FakeZip.failPack = true;
  const pack = downloadSetup({ count: 2 });
  const packed = await runBatchDownload({ ...pack.input, method: 'zip' });
  FakeZip.failPack = false;
  assert.deepEqual([eventFor(packed, 'zip', 2).status, eventFor(packed, 'zip', 2).errorCode], ['failed', 'pack_failed']);

  const write = downloadSetup({ count: 2 });
  const written = await runBatchDownload({ ...write.input, method: 'zip', fileHandle: {}, streamZip: async () => { throw new Error('Ổ đĩa đầy'); } });
  assert.deepEqual([eventFor(written, 'zip', 2).succeededCount, eventFor(written, 'zip', 2).errorCode], [0, 'write_failed']);
});

test('apply events: one per AI run, kept vs edited names, no image or name content', () => {
  const entries = {
    a: { name: 'kim-a', aiName: 'kim-a', aiRunId: 'run-1' },
    b: { name: 'kim-b-sua', aiName: 'kim-b', aiRunId: 'run-1' },
    c: { name: 'kim-c', aiName: 'kim-c', aiRunId: 'run-2' },
    d: { name: 'tu-nhap' },
  };
  const groups = summarizeAppliedNames(['a', 'b', 'c', 'd'], entries);
  assert.deepEqual(groups, [
    { aiRunId: 'run-1', applied: 2, aiUnchanged: 1, edited: 1 },
    { aiRunId: 'run-2', applied: 1, aiUnchanged: 1, edited: 0 },
    { aiRunId: null, applied: 1, aiUnchanged: 0, edited: 1 },
  ]);
  const events = buildApplyEvents({ subject: signedIn, imageBatchId: 'b', groups });
  assert.equal(events.length, 3);
  assert.equal(new Set(events.map((event) => event.operationId)).size, 1, 'one user action');
  assert.equal(new Set(events.map((event) => event.eventId)).size, 3);
  assert.deepEqual(events[0].metadata, { ai_unchanged_count: 1, edited_count: 1 });
  const serialized = JSON.stringify(events);
  for (const forbidden of ['kim-a', 'tu-nhap', 'blob:', 'data:image']) assert.ok(!serialized.includes(forbidden));
});

// ── Delivery queue ─────────────────────────────────────────────────────────

function memoryStorage() {
  const map = new Map();
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
}

function queueSetup({ user = null, send, storage = memoryStorage(), limits } = {}) {
  let clock = 1_000_000;
  const sent = [];
  const state = { user };
  const queue = createTelemetryQueue({
    send: send ?? (async (events) => { sent.push(events); return {}; }),
    getCurrentUserId: async () => state.user,
    storage,
    now: () => clock,
    schedule: () => null, // tests flush explicitly
    cancel: () => {},
    ...(limits ? { limits } : {}),
  });
  return { queue, sent, state, storage, advance: (ms) => { clock += ms; } };
}

const createEvent = (subject) => buildCreateEvent({ subject, requested: 1, succeeded: 1, failed: 0, skipped: 0, cancelled: 0, aborted: false });

test('a failed send never reaches the user and is retried with the same event ID', async () => {
  let fail = true;
  const attempts = [];
  const { queue, advance } = queueSetup({
    send: async (events) => {
      attempts.push(events.map((event) => event.eventId));
      if (fail) throw new Error('offline');
      return {};
    },
  });
  const event = createEvent(guest);
  assert.equal(queue.track(event), event.eventId);
  await queue.flush();
  assert.equal(queue.pending().length, 1, 'kept for a retry');
  await queue.flush();
  assert.equal(attempts.length, 1, 'waits for the backoff');
  advance(TELEMETRY_LIMITS.baseRetryMs);
  fail = false;
  await queue.flush();
  assert.deepEqual(attempts, [[event.eventId], [event.eventId]], 'same ID → the server dedupes it');
  assert.equal(queue.pending().length, 0);
});

test('bounded: attempts, TTL and queue size', async () => {
  const { queue, advance } = queueSetup({ send: async () => { throw new Error('down'); } });
  queue.track(createEvent(guest));
  for (let index = 0; index < TELEMETRY_LIMITS.maxAttempts; index += 1) {
    await queue.flush();
    advance(TELEMETRY_LIMITS.maxRetryMs);
  }
  assert.equal(queue.pending().length, 0, 'dropped after max attempts');

  queue.track(createEvent(guest));
  advance(TELEMETRY_LIMITS.ttlMs + 1);
  await queue.flush();
  assert.equal(queue.pending().length, 0, 'dropped after the TTL');

  const small = queueSetup({ limits: { ...TELEMETRY_LIMITS, maxQueue: 3 } });
  const ids = Array.from({ length: 5 }, () => small.queue.track(createEvent(guest)));
  assert.deepEqual(small.queue.pending().map((entry) => entry.event.eventId), ids.slice(2), 'oldest dropped first');
});

test('account switch: events of user A are never sent while user B is signed in', async () => {
  let online = false;
  const delivered = [];
  const { queue, state, advance } = queueSetup({
    user: USER_A,
    send: async (events) => {
      if (!online) throw new Error('offline');
      delivered.push(...events.map((event) => event.eventId));
      return {};
    },
  });
  const ofA = createEvent(createSubject(USER_A, VISITOR));
  const ofGuest = createEvent(guest);
  queue.track(ofA);
  queue.track(ofGuest);
  await queue.flush(); // offline: both stay queued

  online = true;
  state.user = null; // logged out: A's event waits, the guest event can go
  advance(TELEMETRY_LIMITS.baseRetryMs);
  await queue.flush();
  assert.deepEqual(delivered, [ofGuest.eventId]);
  assert.deepEqual(queue.pending().map((entry) => entry.event.eventId), [ofA.eventId]);

  state.user = USER_B;
  await queue.flush();
  assert.deepEqual(delivered, [ofGuest.eventId], 'never sent as B');
  assert.equal(queue.pending().length, 0, 'dropped once another account signs in');
});

test('persisted across reloads, without image data; storage errors and rate limits are handled', async () => {
  const storage = memoryStorage();
  const first = queueSetup({ storage, send: async () => { throw new Error('offline'); } });
  const event = createEvent(guest);
  first.queue.track(event);
  const stored = storage.map.get('usage_telemetry_queue_v1');
  assert.ok(stored.includes(event.eventId));
  assert.ok(!/blob:|data:image|base64/.test(stored));

  const second = queueSetup({ storage });
  await second.queue.flush();
  assert.deepEqual(second.sent.map((events) => events.map((e) => e.eventId)), [[event.eventId]]);
  assert.equal(storage.map.has('usage_telemetry_queue_v1'), false);

  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } };
  const resilient = queueSetup({ storage: broken });
  assert.doesNotThrow(() => resilient.queue.track(createEvent(guest)));
  await resilient.queue.flush();
  assert.equal(resilient.sent.length, 1);

  const limited = queueSetup({ send: async () => ({ rateLimited: true, retryAfterSeconds: 60 }) });
  limited.queue.track(createEvent(guest));
  await limited.queue.flush();
  assert.equal(limited.queue.pending().length, 1, 'kept when the server asks to slow down');
  assert.equal(limited.queue.pending()[0].attempts, 0);

  const missing = queueSetup({ send: async () => { const error = new Error('missing'); error.permanent = true; throw error; } });
  missing.queue.track(createEvent(guest));
  await missing.queue.flush();
  assert.equal(missing.queue.pending().length, 0, 'RPC not deployed: stop and clear');
  assert.equal(missing.queue.track(createEvent(guest)), null);
});
