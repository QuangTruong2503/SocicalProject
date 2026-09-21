import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processWatermark, resizeBlob, buildFileName, normalizeImageName } from '../src/hooks/useWatermarkProcessor.js';

function canvasEnvironment(t, { width = 1200, height = 800, failLoad = false, failDraw = false, failExport = false } = {}) {
  const calls = [];
  const revoked = [];
  const canvases = [];
  let sequence = 0;
  t.mock.method(URL, 'createObjectURL', () => `blob:test-${++sequence}`);
  t.mock.method(URL, 'revokeObjectURL', (url) => revoked.push(url));
  const previousImage = globalThis.Image;
  const previousDocument = globalThis.document;
  globalThis.Image = class {
    naturalWidth = width;
    naturalHeight = height;
    set src(value) {
      queueMicrotask(() => failLoad ? this.onerror?.(value) : this.onload?.());
    }
  };
  globalThis.document = {
    createElement() {
      const context = {
        fillRect(...args) { calls.push(['fill', this.fillStyle, ...args]); },
        drawImage(...args) {
          if (failDraw) throw new Error('draw failed');
          calls.push(['draw', ...args]);
          assert.ok(calls.length < 11000, 'tiled draw calls must be bounded');
        },
      };
      const canvas = {
        getContext: () => context,
        toBlob(callback, type) {
          calls.push(['export', this.width, this.height, context.globalAlpha]);
          callback(failExport ? null : new Blob(['jpeg'], { type }));
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  t.after(() => { globalThis.Image = previousImage; globalThis.document = previousDocument; });
  return { calls, revoked, canvases };
}

test('JPEG export paints a white background and releases its canvas and URL', async (t) => {
  const env = canvasEnvironment(t);
  const blob = await processWatermark(new Blob(['source']), null);
  assert.equal(blob.type, 'image/jpeg');
  assert.deepEqual(env.calls[0], ['fill', '#ffffff', 0, 0, 1200, 800]);
  assert.equal(env.revoked.length, 1);
  assert.equal(env.canvases[0].width, 0);
});

test('tiny tiled images finish with nonzero logo dimensions', async (t) => {
  const env = canvasEnvironment(t, { width: 1, height: 1 });
  await processWatermark(new Blob(), { naturalWidth: 100, naturalHeight: 1 }, { size: 10, tiled: true });
  const logoCalls = env.calls.filter((call) => call[0] === 'draw').slice(1);
  assert.ok(logoCalls.length > 0 && logoCalls.length < 10);
  assert.ok(logoCalls.every((call) => call.at(-1) > 0 && call.at(-2) > 0));
});

test('extreme logo aspect ratio cannot produce unbounded tiling', async (t) => {
  const env = canvasEnvironment(t);
  await processWatermark(new Blob(), { naturalWidth: 100000, naturalHeight: 1 }, { tiled: true });
  assert.ok(env.calls.length < 11000);
});

test('preview is downscaled and opacity zero is preserved', async (t) => {
  const env = canvasEnvironment(t);
  await processWatermark(new Blob(), { naturalWidth: 100, naturalHeight: 100 }, { maxDimension: 600, opacity: 0 });
  assert.deepEqual(env.calls.find((call) => call[0] === 'export'), ['export', 600, 400, 0]);
});

test('tall logos fit inside the image', async (t) => {
  const env = canvasEnvironment(t);
  await processWatermark(new Blob(), { naturalWidth: 100, naturalHeight: 10000 }, { size: 200, logoPosition: 'bottom-right' });
  const draw = env.calls.filter((call) => call[0] === 'draw')[1];
  assert.ok(draw[3] >= 0);
  assert.ok(draw[5] <= 800);
});

for (const failure of ['failLoad', 'failDraw', 'failExport']) {
  test(`${failure} rejects and frees allocated resources`, async (t) => {
    const env = canvasEnvironment(t, { [failure]: true });
    await assert.rejects(processWatermark(new Blob(), null));
    assert.equal(env.revoked.length, 1);
    assert.ok(env.canvases.every((canvas) => canvas.width === 0));
  });
}

test('resize preserves proportions using white letterboxing', async (t) => {
  const env = canvasEnvironment(t, { width: 1000, height: 1000 });
  await resizeBlob(new Blob(), 800, 600);
  const draw = env.calls.find((call) => call[0] === 'draw');
  assert.deepEqual(draw.slice(2), [100, 0, 600, 600]);
  assert.deepEqual(env.calls[0], ['fill', '#ffffff', 0, 0, 800, 600]);
});

test('filenames preserve meaningful dots and cannot add ZIP directories', () => {
  assert.equal(normalizeImageName('product.v2.png'), 'product.v2.jpg');
  assert.equal(normalizeImageName('../folder/name'), '..-folder-name.jpg');
  assert.equal(buildFileName('shirt.png', 1, 3), 'shirt_02.jpg');
  assert.equal(buildFileName(undefined, 0, 1), 'image.jpg');
});
