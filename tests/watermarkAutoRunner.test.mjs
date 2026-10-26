// /watermark/auto queue on in-memory folders, a fake engine and a fake AI endpoint.
// Run with: node --import ./tests/aiRenameLoader.mjs --test tests/watermarkAutoRunner.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JPEG, imagesSpec, makeTree } from './fixtures/fakeFileSystem.mjs';

const { createAutoRunner, MAX_FAILED_BATCHES_IN_A_ROW } = await import('../src/hooks/useWatermarkAutoProcessor.js');
const { slugifyFileName } = await import('../src/utils/aiImageNaming.js');

const CONFIG = {
  renderOptions: { size: 60, opacity: 60, margin: 2, tiled: false, logoPosition: 'center' },
  outputSize: '800x600',
  model: 'gpt-6-luna',
  prompt: 'Prompt {{productName}}',
};

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

/** Default AI: one name per image, "<product>-mo-ta-<position>". */
const describeAll = ({ productName, images }) => ({
  data: { items: images.map((image) => ({ imageId: image.id, suggestedName: `${slugifyFileName(productName)}-mo-ta-${image.position}`, needsReview: false })), failed: [] },
  error: null,
  code: null,
});

function setup({ picks = [], ai = describeAll, now } = {}) {
  const log = { ai: [], renders: [], resizes: [], dataUrlSources: [], segments: [], rejections: [] };
  const clock = { value: 1_000_000 };
  const engine = {
    async render(file, options, overrides) {
      const text = await file.text();
      log.renders.push({ name: file.name, text, options, overrides });
      if (file.name.includes('broken')) throw new Error('Không thể đọc ảnh. Hãy chọn một ảnh hợp lệ.');
      if (file.name.includes('huge')) throw new Error('Thiết bị không đủ bộ nhớ để xử lý ảnh này.');
      return { blob: new Blob([`wm(${file.name})`], { type: 'image/jpeg' }), thumbBlob: new Blob(['t']) };
    },
    async resize(blob, width, height) {
      log.resizes.push({ width, height });
      return new Blob([await blob.text(), `@${width}x${height}`], { type: 'image/jpeg' });
    },
  };
  const runner = createAutoRunner({
    engine,
    pickDirectory: async () => picks.shift() ?? null,
    requestNames: async (input) => {
      log.ai.push(input);
      return ai(input, log.ai.length);
    },
    createAiImageDataUrl: async (source) => {
      log.dataUrlSources.push(source);
      return 'data:image/jpeg;base64,AAAA';
    },
    checkSession: async () => true,
    schedule: (callback) => callback(),
    now: now ?? (() => clock.value),
    getSupport: () => ({ supported: true, reason: null }),
    onSegmentEnd: (summary) => log.segments.push(summary),
    onAccessRejected: (code) => log.rejections.push(code),
  });
  return { runner, log, clock, snap: () => runner.getSnapshot() };
}

const namesIn = (dir) => [...(dir.file('Named')?.handle.children.keys() ?? [])].sort();
const product = (snap, name) => snap().products.find((item) => item.name === name);

test('parent folder: products in order, one product per request, ≤6 images, >60 images go through', async () => {
  const root = makeTree('SanPham', {
    'Máy khoan Bosch GSB 13 RE': imagesSpec(70),
    'Máy mài Makita 9553B': { 'IMG_003.webp': [...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))) },
    'IMG_root.jpg': JPEG,
  });
  const { runner, log, snap } = setup({ picks: [root] });
  await runner.addParentFolder();
  assert.deepEqual(snap().products.map((item) => item.name), ['Máy khoan Bosch GSB 13 RE', 'Máy mài Makita 9553B']);
  assert.match(snap().notices.map((notice) => notice.text).join(' '), /Bỏ qua 1 ảnh nằm ngay trong thư mục cha/);

  assert.deepEqual(await runner.start(CONFIG), { ok: true });
  await runner.idle();

  assert.equal(log.ai.length, 13, '70 images → 12 batches, + 1 for the second product');
  assert.ok(log.ai.every((request) => request.images.length <= 6));
  assert.ok(log.ai.slice(0, 12).every((request) => request.productName === 'Máy khoan Bosch GSB 13 RE'));
  assert.equal(log.ai[12].productName, 'Máy mài Makita 9553B');
  assert.equal(new Set(log.ai.map((request) => request.requestId)).size, 13, 'new requestId per batch');
  assert.equal(new Set(log.ai.map((request) => request.aiRunId)).size, 1, 'one aiRunId per click');
  assert.equal(log.ai[0].prompt, CONFIG.prompt);
  assert.equal(log.ai[0].model, 'gpt-6-luna');

  const drill = root.file('Máy khoan Bosch GSB 13 RE').handle;
  assert.equal(namesIn(drill).length, 70);
  assert.ok(namesIn(drill).includes('may-khoan-bosch-gsb-13-re-mo-ta-70.jpg'));
  assert.deepEqual(namesIn(root.file('Máy mài Makita 9553B').handle), ['may-mai-makita-9553b-mo-ta-1.jpg']);
  assert.equal(drill.file('IMG_1.jpg').committed, true, 'sources untouched');
  assert.ok(log.renders.every((call) => call.overrides.maxDimension === 4096));
  assert.ok(log.resizes.every((call) => call.width === 800 && call.height === 600));
  assert.ok(log.dataUrlSources.every((source) => !source.blob && source.sourceFile instanceof File), 'AI gets the original, never the logo copy');

  const run = snap().run;
  assert.equal(run.state, 'finished');
  assert.deepEqual([run.saved, run.total, run.errors, run.review, run.productsWithSaved], [71, 71, 0, 0, 2]);
  const written = (await root.file('Máy mài Makita 9553B').handle.file('Named').handle.file('may-mai-makita-9553b-mo-ta-1.jpg').data.text());
  assert.equal(written, 'wm(IMG_003.webp)@800x600', 'logo first, then letterbox');
});

test('the same folder twice is one product; equal names in different places are two', async () => {
  const root = makeTree('R', { A: { 'Máy': { 'a.jpg': JPEG } }, B: { 'Máy': { 'a.jpg': JPEG } } });
  const a = root.file('A').handle;
  const { runner, snap } = setup({ picks: [a.file('Máy').handle, a, a.file('Máy').handle, root.file('B').handle] });
  await runner.addProductFolder();
  await runner.addParentFolder();
  assert.match(snap().notices.map((notice) => notice.text).join(' '), /1 thư mục đã có trong danh sách/);
  await runner.addProductFolder();
  assert.match(snap().notices[0].text, /đã có trong danh sách/);
  await runner.addParentFolder();
  const products = snap().products;
  assert.equal(products.length, 2);
  assert.deepEqual(products.map((item) => item.relativePath), ['Máy', 'B/Máy']);
  assert.notEqual(products[0].id, products[1].id);
});

test('reordered, missing, duplicate and unknown IDs never move a name to another image', async () => {
  const root = makeTree('P', { 'Máy': imagesSpec(4) });
  const { runner, log, snap } = setup({
    picks: [root.file('Máy').handle],
    ai: ({ images }) => ({
      data: {
        items: [
          { imageId: images[2].id, suggestedName: 'may-ba', needsReview: false },
          { imageId: images[0].id, suggestedName: 'may-mot', needsReview: true },
          { imageId: images[0].id, suggestedName: 'may-trung', needsReview: false },
          { imageId: 'img-unknown', suggestedName: 'may-la', needsReview: false },
          { imageId: images[3].id, suggestedName: '', needsReview: false },
        ],
        failed: [],
      },
      error: null,
      code: null,
    }),
  });
  await runner.addProductFolder();
  await runner.start(CONFIG);
  await runner.idle();
  const images = product(snap, 'Máy').images;
  assert.deepEqual(images.map((image) => [image.sourceName, image.status, image.outputName]), [
    ['IMG_1.jpg', 'saved', 'may-mot.jpg'],
    ['IMG_2.jpg', 'error', null],
    ['IMG_3.jpg', 'saved', 'may-ba.jpg'],
    ['IMG_4.jpg', 'error', null],
  ]);
  assert.equal(images[0].needsReview, true);
  assert.equal(images[1].errorCode, 'ai_missing');
  assert.equal(log.ai.length, 1);
  const run = snap().run;
  assert.deepEqual([run.saved, run.errors, run.review], [2, 2, 1]);
  assert.equal(run.state, 'finished');
});

test('unclear images keep the padded fallback name and are flagged; review is part of saved', async () => {
  const root = makeTree('P', { 'Máy khoan': imagesSpec(2) });
  const { runner, snap } = setup({
    picks: [root.file('Máy khoan').handle],
    ai: ({ images }) => ({ data: { items: images.map((image) => ({ imageId: image.id, suggestedName: `may-khoan-${image.position}`, needsReview: true })), failed: [] }, error: null, code: null }),
  });
  await runner.addProductFolder();
  await runner.start(CONFIG);
  await runner.idle();
  assert.deepEqual(namesIn(root.file('Máy khoan').handle), ['may-khoan-001.jpg', 'may-khoan-002.jpg']);
  assert.deepEqual([snap().run.saved, snap().run.review], [2, 2]);
});

test('names stay unique per Named across batches and against files already there', async () => {
  const root = makeTree('P', { 'Máy': { ...imagesSpec(8), Named: { 'may-giong.jpg': JPEG, 'MAY-GIONG-2.JPG': JPEG } } });
  const { runner, log } = setup({
    picks: [root.file('Máy').handle],
    ai: ({ images }) => ({ data: { items: images.map((image) => ({ imageId: image.id, suggestedName: 'may-giong', needsReview: false })), failed: [] }, error: null, code: null }),
  });
  await runner.addProductFolder();
  await runner.start(CONFIG);
  await runner.idle();
  assert.equal(log.ai.length, 2);
  const names = namesIn(root.file('Máy').handle);
  assert.equal(names.length, 10);
  assert.ok(names.includes('may-giong-10.jpg') && names.includes('may-giong-3.jpg'));
  assert.equal(new Set(names.map((name) => name.toLowerCase())).size, 10);
  // IMG_1 got the first free suffix: order follows the folder, not the answers.
  const image1 = [...root.fs.writes].find((write) => write.path.endsWith('may-giong-3.jpg'));
  assert.equal(await image1.data.text(), 'wm(IMG_1.jpg)@800x600');
});

test('stop: a late answer is not written, saved files stay, resume only does the rest', async () => {
  const root = makeTree('P', { 'Máy': imagesSpec(12) });
  const gate = deferred();
  const { runner, log, snap } = setup({
    picks: [root.file('Máy').handle],
    ai: async (input, call) => {
      if (call === 2) await gate.promise; // ignores the abort signal on purpose
      return describeAll(input);
    },
  });
  await runner.addProductFolder();
  await runner.start(CONFIG);
  while (log.ai.length < 2) await new Promise((resolve) => setTimeout(resolve, 1));
  runner.stop();
  assert.equal(snap().run.state, 'stopping');
  assert.equal(log.ai[1].signal.aborted, true, 'request aborted');
  gate.resolve();
  await runner.idle();
  assert.equal(snap().run.state, 'paused');
  assert.equal(snap().run.pause.kind, 'stopped');
  assert.equal(namesIn(root.file('Máy').handle).length, 6, 'only the first batch');
  assert.deepEqual([snap().run.saved, snap().run.errors, snap().run.pending], [6, 0, 6], 'not counted as AI errors');

  const rendersBefore = log.renders.length;
  assert.deepEqual(runner.resume(), { ok: true });
  await runner.idle();
  assert.equal(snap().run.state, 'finished');
  assert.equal(namesIn(root.file('Máy').handle).length, 12);
  assert.deepEqual(log.renders.slice(rendersBefore).map((call) => call.name), Array.from({ length: 6 }, (_, i) => `IMG_${i + 7}.jpg`));
  assert.equal(log.ai[2].requestId !== log.ai[1].requestId, true);
});

test('a failed write is retried without a second AI call, rendered again from the original', async () => {
  const root = makeTree('P', { 'Máy': imagesSpec(3) });
  const { runner, log, snap } = setup({ picks: [root.file('Máy').handle] });
  let failOnce = true;
  root.fs.failClose = (name) => {
    if (name === 'may-mo-ta-2.jpg' && failOnce) {
      failOnce = false;
      return new Error('I/O');
    }
    return null;
  };
  await runner.addProductFolder();
  await runner.start(CONFIG);
  await runner.idle();
  const failed = product(snap, 'Máy').images[1];
  assert.deepEqual([failed.status, failed.errorCode], ['error', 'write_failed']);
  assert.equal(snap().run.retryableErrors, 1);
  assert.equal(log.ai.length, 1);
  const created = log.segments[0].segment.create.succeeded;
  assert.equal(created, 3);

  assert.deepEqual(runner.retryErrors(), { ok: true });
  await runner.idle();
  assert.equal(log.ai.length, 1, 'cached AI name reused');
  assert.equal(product(snap, 'Máy').images[1].outputName, 'may-mo-ta-2.jpg', 'same reserved name');
  const lastRender = log.renders.at(-1);
  assert.equal(lastRender.name, 'IMG_2.jpg');
  assert.ok(!lastRender.text.startsWith('wm('), 'never re-stamps the exported file');
  assert.deepEqual(namesIn(root.file('Máy').handle), ['may-mo-ta-1.jpg', 'may-mo-ta-2.jpg', 'may-mo-ta-3.jpg']);
  assert.equal(log.segments[1].segment.create.requested, 0, 'a re-written image is not created twice');
  assert.equal(log.segments[1].segment.write.written, 1);
});

test('changed source files fail without AI and are not retried with an old name', async () => {
  const root = makeTree('P', { 'Máy': imagesSpec(2) });
  const { runner, log, snap } = setup({ picks: [root.file('Máy').handle] });
  await runner.addProductFolder();
  root.file('Máy').handle.addFile('IMG_2.jpg', [...JPEG, 9]);
  await runner.start(CONFIG);
  await runner.idle();
  const image = product(snap, 'Máy').images[1];
  assert.equal(image.errorCode, 'source_changed');
  assert.deepEqual(log.ai[0].images.map((item) => item.position), [1]);
  assert.equal(snap().run.retryableErrors, 0);
  await runner.rescanProduct(product(snap, 'Máy').id);
  assert.equal(product(snap, 'Máy').images.every((item) => item.status === 'queued'), true);
});

test('broken images and canvas limits fail alone and are never sent to AI', async () => {
  const root = makeTree('P', { 'Máy': { 'a.jpg': JPEG, 'broken.jpg': JPEG, 'huge.jpg': JPEG } });
  const { runner, log, snap } = setup({ picks: [root.file('Máy').handle] });
  await runner.addProductFolder();
  await runner.start({ ...CONFIG, outputSize: 'original' });
  await runner.idle();
  assert.deepEqual(log.ai[0].images.map((item) => item.position), [1]);
  const [ok, broken, huge] = product(snap, 'Máy').images;
  assert.equal(ok.status, 'saved');
  assert.equal(broken.errorCode, 'decode_failed');
  assert.equal(huge.errorCode, 'too_large');
  assert.match(huge.errorMessage, /800 × 600/);
  assert.ok(log.renders.every((call) => call.overrides.maxDimension === 0), 'original size: no 4096 clamp');
  assert.equal(log.resizes.length, 0);
});

test('rate limit pauses the queue until the wait is over; images wait instead of failing', async () => {
  const root = makeTree('P', { 'Máy': imagesSpec(8) });
  let limited = true;
  const { runner, log, snap, clock } = setup({
    picks: [root.file('Máy').handle],
    ai: (input, call) => (call === 2 && limited
      ? { data: null, code: 'rate_limited', error: 'Bạn đã gửi quá nhiều yêu cầu.', retryAfterSeconds: 120 }
      : describeAll(input)),
  });
  await runner.addProductFolder();
  await runner.start(CONFIG);
  await runner.idle();
  const run = snap().run;
  assert.equal(run.state, 'paused');
  assert.equal(run.pause.code, 'rate_limited');
  assert.equal(run.pause.until, clock.value + 120_000);
  assert.deepEqual([run.saved, run.errors, run.pending], [6, 0, 2]);
  assert.equal(runner.resume().reason, 'wait');
  assert.equal(log.ai.length, 2, 'no request while waiting');
  clock.value += 121_000;
  limited = false;
  assert.deepEqual(runner.resume(), { ok: true });
  await runner.idle();
  assert.equal(snap().run.saved, 8);
});

test('access, quota and session errors stop new requests and are reported', async () => {
  for (const code of ['AI_NAMING_ACCESS_DENIED', 'AI_QUOTA_EXCEEDED', 'AUTH_REQUIRED', 'AI_USAGE_PAUSED', 'network', 'timeout']) {
    const root = makeTree('P', { 'Máy': imagesSpec(12) });
    const { runner, log, snap } = setup({ picks: [root.file('Máy').handle], ai: () => ({ data: null, code, error: `lỗi ${code}` }) });
    await runner.addProductFolder();
    await runner.start(CONFIG);
    await runner.idle();
    assert.equal(log.ai.length, 1, `${code}: no second batch`);
    assert.equal(snap().run.state, 'paused');
    assert.equal(snap().run.pause.message, `lỗi ${code}`);
    assert.equal(snap().run.errors, 0, `${code}: images wait`);
    assert.equal(root.fs.writes.length, 0);
    if (code === 'AI_NAMING_ACCESS_DENIED' || code === 'AUTH_REQUIRED') assert.deepEqual(log.rejections, [code]);
  }
});

test('other AI errors fail their batch; repeated ones pause instead of failing everything', async () => {
  const root = makeTree('P', { 'Máy': imagesSpec(30) });
  const { runner, log, snap } = setup({ picks: [root.file('Máy').handle], ai: () => ({ data: null, code: 'invalid_response', error: 'Máy chủ trả về dữ liệu không hợp lệ.' }) });
  await runner.addProductFolder();
  await runner.start(CONFIG);
  await runner.idle();
  assert.equal(log.ai.length, MAX_FAILED_BATCHES_IN_A_ROW);
  assert.equal(snap().run.errors, 6 * (MAX_FAILED_BATCHES_IN_A_ROW - 1));
  assert.equal(snap().run.state, 'paused');
});

test('disk full pauses the whole run', async () => {
  const root = makeTree('P', { A: imagesSpec(3), B: imagesSpec(3) });
  const { runner, snap } = setup({ picks: [root] });
  await runner.addParentFolder();
  root.fs.failClose = (name) => (name.endsWith('-2.jpg') ? new DOMException('full', 'QuotaExceededError') : null);
  await runner.start(CONFIG);
  await runner.idle();
  assert.equal(snap().run.pause.kind, 'disk');
  assert.deepEqual(namesIn(root.file('A').handle), ['a-mo-ta-1.jpg']);
  assert.equal(root.file('B').handle.file('Named'), undefined, 'next product not started');
});

test('a folder that loses permission is paused alone; granting again resumes it without new AI calls', async () => {
  const root = makeTree('P', { A: imagesSpec(2), B: imagesSpec(2) });
  const a = root.file('A').handle;
  const { runner, log, snap } = setup({
    picks: [root],
    ai: (input) => {
      // Permission is revoked while A's answer is on its way (e.g. the user clicked “Block” in site settings).
      if (input.productName === 'A') a.permission = 'prompt';
      return describeAll(input);
    },
  });
  await runner.addParentFolder();
  assert.equal((await runner.start(CONFIG)).ok, true);
  await runner.idle();
  let view = snap();
  const productA = view.products.find((item) => item.name === 'A');
  assert.equal(productA.status, 'blocked');
  assert.equal(productA.blocked.code, 'permission');
  assert.deepEqual(productA.images.map((image) => image.status), ['cancelled', 'cancelled'], 'waiting, not failed');
  assert.equal(view.products.find((item) => item.name === 'B').status, 'done', 'other folders continue');
  assert.deepEqual([view.run.state, view.run.pause.kind], ['paused', 'blocked']);
  assert.equal(root.fs.requests.length, 0, 'no prompt from the background loop');

  root.fs.grantOnRequest = true;
  assert.equal(await runner.requestPermission(productA.id), 'granted');
  assert.equal(snap().products.find((item) => item.name === 'A').blocked, null);
  runner.resume();
  await runner.idle();
  view = snap();
  assert.equal(view.run.state, 'finished');
  assert.equal(view.run.saved, 4);
  assert.deepEqual(log.ai.map((request) => request.productName), ['A', 'B'], 'names received before the loss are reused');
  assert.deepEqual(namesIn(a), ['a-mo-ta-1.jpg', 'a-mo-ta-2.jpg']);
});

test('start re-checks permission and session and refuses folder names over the backend limit', async () => {
  const long = 'M'.repeat(151);
  const root = makeTree('P', { A: imagesSpec(1), [long]: imagesSpec(1) });
  const { runner, snap } = setup({ picks: [root] });
  await runner.addParentFolder();
  const longProduct = snap().products.find((item) => item.folderName === long);
  assert.equal(longProduct.selected, false);
  assert.match(longProduct.nameError, /tối đa 150/);
  runner.setSelected(longProduct.id, true);
  assert.equal(snap().products.find((item) => item.id === longProduct.id).selected, false, 'cannot be selected');

  root.fs.permission = 'prompt';
  const refused = await runner.start(CONFIG);
  assert.deepEqual(refused, { ok: false, reason: 'permission', products: ['A'] });
  assert.equal(root.fs.requests.length, 0, 'start never opens permission prompts');

  root.fs.permission = 'granted';
  const noSession = createAutoRunner({ engine: {}, checkSession: async () => false, pickDirectory: async () => root.file('A').handle, schedule: (cb) => cb(), getSupport: () => ({ supported: true }) });
  await noSession.addProductFolder();
  assert.deepEqual(await noSession.start(CONFIG), { ok: false, reason: 'auth' });
});

test('choosing Named itself, an empty folder or cancelling the dialog', async () => {
  const root = makeTree('P', { Named: { 'x.jpg': JPEG }, Empty: { 'a.txt': [65] } });
  const { runner, snap } = setup({ picks: [root.file('Named').handle, root.file('Empty').handle] });
  await runner.addProductFolder();
  assert.equal(snap().products.length, 0);
  assert.match(snap().notices[0].text, /thư mục kết quả/);
  await runner.addProductFolder();
  const empty = snap().products[0];
  assert.deepEqual([empty.status, empty.selected], ['empty', false]);
  assert.equal(root.file('Empty').handle.file('Named'), undefined, 'no empty Named from scanning');
  const result = await runner.addProductFolder();
  assert.deepEqual(result, { cancelled: true });
  assert.equal(snap().products.length, 1, 'cancel keeps the list');
  assert.deepEqual(await runner.start(CONFIG), { ok: false, reason: 'no_images' });
});

test('leaving the page during an AI request writes nothing afterwards', async () => {
  const root = makeTree('P', { 'Máy': imagesSpec(2) });
  const gate = deferred();
  const { runner, log } = setup({ picks: [root.file('Máy').handle], ai: async (input) => { await gate.promise; return describeAll(input); } });
  await runner.addProductFolder();
  await runner.start(CONFIG);
  while (!log.ai.length) await new Promise((resolve) => setTimeout(resolve, 1));
  runner.dispose();
  gate.resolve();
  await runner.idle();
  assert.equal(root.fs.writes.length, 0);
  assert.equal(log.segments[0].segment.aborted, true);
});

test('locked while running: no new folders, no removal, no second start', async () => {
  const root = makeTree('P', { 'Máy': imagesSpec(2), Khác: imagesSpec(1) });
  const gate = deferred();
  const { runner, log, snap } = setup({ picks: [root.file('Máy').handle, root.file('Khác').handle], ai: async (input) => { await gate.promise; return describeAll(input); } });
  await runner.addProductFolder();
  await runner.start(CONFIG);
  assert.equal(await runner.addProductFolder(), null);
  runner.removeProduct(snap().products[0].id);
  assert.equal(snap().products.length, 1);
  assert.equal((await runner.start(CONFIG)).reason, 'busy');
  while (!log.ai.length) await new Promise((resolve) => setTimeout(resolve, 1));
  gate.resolve();
  await runner.idle();
  assert.equal(snap().run.state, 'finished');
});
