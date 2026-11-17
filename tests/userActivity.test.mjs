import test from 'node:test';
import assert from 'node:assert/strict';
import { trackUserActivity, USER_ACTIVITY_INTERVAL_MS } from '../src/utils/userActivity.js';

function setup(recordActivity) {
  const target = new EventTarget();
  target.visibilityState = 'visible';
  let clock = 0;
  let calls = 0;
  const stop = trackUserActivity({ target, now: () => clock, recordActivity: async () => {
    calls += 1;
    await recordActivity?.();
  } });
  return {
    target, stop,
    get calls() { return calls; },
    advance(ms = USER_ACTIVITY_INTERVAL_MS) { clock += ms; },
    async send(type) { target.dispatchEvent(new Event(type)); await settle(); },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('visible visit and real interactions are recorded at most once per minute', async () => {
  const tracker = setup();
  assert.equal(tracker.calls, 1);
  await settle();
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'visibilitychange']) await tracker.send(type);
  assert.equal(tracker.calls, 1);
  tracker.advance();
  await tracker.send('scroll');
  assert.equal(tracker.calls, 2);
  tracker.advance(10 * USER_ACTIVITY_INTERVAL_MS);
  await settle();
  assert.equal(tracker.calls, 2, 'idle time alone does not send heartbeats');
  await tracker.send('keydown');
  assert.equal(tracker.calls, 3);
  tracker.stop();
  tracker.advance();
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'visibilitychange']) await tracker.send(type);
  assert.equal(tracker.calls, 3, 'logout/unmount removes every listener');
});

test('hidden tabs do not record activity; returning to a visible tab does', async () => {
  const tracker = setup();
  await settle();
  tracker.advance();
  tracker.target.visibilityState = 'hidden';
  await tracker.send('visibilitychange');
  await tracker.send('pointerdown');
  assert.equal(tracker.calls, 1);
  tracker.target.visibilityState = 'visible';
  await tracker.send('visibilitychange');
  assert.equal(tracker.calls, 2);
  tracker.stop();
});

test('a session restored in a hidden tab waits until it becomes visible', async () => {
  const target = new EventTarget();
  target.visibilityState = 'hidden';
  let calls = 0;
  const stop = trackUserActivity({ target, recordActivity: async () => { calls += 1; } });
  await settle();
  assert.equal(calls, 0);
  target.visibilityState = 'visible';
  target.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.equal(calls, 1);
  stop();
});

test('slow requests never overlap; failed requests stay throttled and recover', async (t) => {
  let release;
  let fail = false;
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  const tracker = setup(() => new Promise((resolve, reject) => { release = () => fail ? reject(new Error('offline')) : resolve(); }));
  tracker.advance();
  await tracker.send('pointerdown');
  assert.equal(tracker.calls, 1);
  release();
  await settle();
  fail = true;
  await tracker.send('pointerdown');
  assert.equal(tracker.calls, 2);
  release();
  await settle();
  assert.equal(warnings.length, 1);
  await tracker.send('keydown');
  assert.equal(tracker.calls, 2);
  tracker.advance();
  fail = false;
  await tracker.send('keydown');
  assert.equal(tracker.calls, 3);
  release();
  await settle();
  tracker.stop();
});
