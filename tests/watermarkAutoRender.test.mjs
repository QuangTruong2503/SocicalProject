// Original size vs 800×600 on both rendering paths: the Web Worker (OffscreenCanvas)
// and the main-thread fallback the engine uses when workers are unavailable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_OUTPUT_DIMENSION, KEEP_ORIGINAL_SIZE, fitWithin } from '../src/utils/watermarkRender.js';

const SOURCE = { width: 6000, height: 4000 };

function mockCanvasContext(log) {
  return {
    fillRect(...args) { log.push(['fill', ...args]); },
    drawImage(...args) { log.push(['draw', ...args.slice(1)]); },
  };
}

test('fitWithin: 0 keeps the size, the default clamps to 4096', () => {
  assert.deepEqual(fitWithin(6000, 4000, KEEP_ORIGINAL_SIZE), { width: 6000, height: 4000 });
  assert.deepEqual(fitWithin(6000, 4000, MAX_OUTPUT_DIMENSION), { width: 4096, height: 2731 });
  assert.deepEqual(fitWithin(300, 200, MAX_OUTPUT_DIMENSION), { width: 300, height: 200 }, 'never upscales');
});

test('worker: original size is not clamped, EXIF orientation is applied once, 800×600 letterboxes', async (t) => {
  const posted = [];
  const canvases = [];
  const bitmapOptions = [];
  const previous = { self: globalThis.self, OffscreenCanvas: globalThis.OffscreenCanvas, createImageBitmap: globalThis.createImageBitmap };
  globalThis.self = globalThis;
  globalThis.postMessage = (message) => posted.push(message);
  globalThis.createImageBitmap = async (source, options) => {
    bitmapOptions.push(options);
    return { ...(source.__size || SOURCE), close() {} };
  };
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.log = [];
      canvases.push(this);
    }
    getContext() { return mockCanvasContext(this.log); }
    async convertToBlob() { return Object.assign(new Blob(['jpeg'], { type: 'image/jpeg' }), { __size: { width: this.createdWidth, height: this.createdHeight } }); }
  };
  t.after(() => Object.assign(globalThis, previous));
  await import(`../src/workers/watermark.worker.js?${Date.now()}`);

  const render = async (maxDimension) => {
    canvases.length = 0;
    await globalThis.onmessage({ data: { type: 'render', id: 1, file: new Blob(['x']), options: {}, maxDimension, thumbDimension: 360, quality: 0.92 } });
    return canvases[0];
  };
  const original = await render(KEEP_ORIGINAL_SIZE);
  assert.ok(original, `render posted: ${JSON.stringify(posted.at(-1))}`);
  assert.deepEqual(original.log.find((call) => call[0] === 'draw').slice(-2), [6000, 4000]);
  assert.deepEqual(bitmapOptions[0], { imageOrientation: 'from-image' });
  const clamped = await render(MAX_OUTPUT_DIMENSION);
  assert.deepEqual(clamped.log.find((call) => call[0] === 'draw').slice(-2), [4096, 2731]);

  canvases.length = 0;
  const blob = Object.assign(new Blob(['x']), { __size: SOURCE });
  await globalThis.onmessage({ data: { type: 'resize', id: 2, blob, width: 800, height: 600, quality: 0.9 } });
  const box = canvases[0];
  assert.deepEqual([box.width, box.height], [0, 0], 'backing store released after export');
  assert.deepEqual(box.log[0], ['fill', 0, 0, 800, 600], 'white 800×600 background');
  const [x, y, width, height] = box.log[1].slice(1);
  assert.deepEqual([x, Math.round(y), width, Math.round(height)], [0, 33, 800, 533], 'centered, proportional, not cropped');
  assert.ok(posted.every((message) => !message.error));
});

test('main-thread fallback: the engine passes 0 through and the export keeps 6000×4000', async (t) => {
  const exports = [];
  const previous = { document: globalThis.document, Image: globalThis.Image, createImageBitmap: globalThis.createImageBitmap };
  delete globalThis.createImageBitmap;
  t.mock.method(URL, 'createObjectURL', () => 'blob:test');
  t.mock.method(URL, 'revokeObjectURL', () => {});
  globalThis.Image = class {
    naturalWidth = SOURCE.width;
    naturalHeight = SOURCE.height;
    width = SOURCE.width;
    height = SOURCE.height;
    set src(value) { queueMicrotask(() => this.onload?.(value)); }
  };
  globalThis.document = {
    createElement() {
      const canvas = {
        getContext: () => ({ fillRect() {}, drawImage() {}, globalAlpha: 1 }),
        toBlob(callback, type) {
          exports.push([this.width, this.height]);
          callback(new Blob(['jpeg'], { type }));
        },
      };
      return canvas;
    },
  };
  t.after(() => Object.assign(globalThis, previous));

  const { createWatermarkEngine } = await import('../src/utils/watermarkEngine.js');
  const engine = createWatermarkEngine();
  assert.equal(await engine.usesWorker(), false, 'Node has no Worker: fallback path');
  await engine.render(new Blob(['x']), { size: 60 }, { maxDimension: KEEP_ORIGINAL_SIZE });
  assert.deepEqual(exports[0], [6000, 4000]);
  exports.length = 0;
  await engine.render(new Blob(['x']), { size: 60 });
  assert.deepEqual(exports[0], [4096, 2731], '/watermark default unchanged');
  exports.length = 0;
  await engine.resize(new Blob(['x']), 800, 600);
  assert.deepEqual(exports[0], [800, 600]);
  engine.dispose();
});
