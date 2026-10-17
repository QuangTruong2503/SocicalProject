import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { describeRejections, fitFileBudget, formatBytes, moveItem, sniffFileKind } from './fileConvertChecks.js';
import { buildImagesPdf, computeImagePageLayout, readJpegOrientation } from './imagesToPdf.js';
import { extractPdfPages, mergePdfs } from './pdfEdit.js';
import { formatPageRange, parsePageRange, togglePage } from './pdfPageRange.js';
import { createSerialQueue, fitRenderScale } from './pdfRender.js';

const MM_TO_PT = 72 / 25.4;
const close = (actual, expected, tolerance = 0.05) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);

function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

/** Solid-colour RGB PNG. */
function makePng(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height, 0x80);
  for (let y = 0; y < height; y += 1) rows[y * (width * 3 + 1)] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}

/** JPEG skeleton: SOI, optional EXIF orientation, SOF0 with the size, EOI. Enough for header parsers. */
function makeJpegHeader(width, height, orientation, littleEndian = false) {
  const bytes = [0xff, 0xd8];
  if (orientation) {
    const tiff = Buffer.alloc(26);
    if (littleEndian) {
      tiff.write('II', 0, 'ascii'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4); tiff.writeUInt16LE(1, 8);
      tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(orientation, 18);
    } else {
      tiff.write('MM', 0, 'ascii'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4); tiff.writeUInt16BE(1, 8);
      tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(orientation, 18);
    }
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
    bytes.push(0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload);
  }
  bytes.push(0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9);
  return new Uint8Array(bytes);
}

async function makePdf(sizes) {
  const doc = await PDFDocument.create();
  sizes.forEach(([width, height]) => doc.addPage([width, height]));
  return new Uint8Array(await doc.save());
}

const pageSizes = async (blob) => (await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()))).getPages().map((page) => {
  const { width, height } = page.getSize();
  return [Math.round(width), Math.round(height)];
});

test('page ranges keep typed order, drop repeats and reject bad input', () => {
  assert.deepEqual(parsePageRange('1-3,5,8', 10).pages, [1, 2, 3, 5, 8]);
  assert.deepEqual(parsePageRange(' 5 , 1 - 3 ', 10).pages, [5, 1, 2, 3]);
  assert.deepEqual(parsePageRange('1–2; 4', 4).pages, [1, 2, 4]);
  const repeated = parsePageRange('1-3,2,3', 5);
  assert.deepEqual(repeated.pages, [1, 2, 3]);
  assert.deepEqual(repeated.duplicates, [2, 3]);
  assert.deepEqual(parsePageRange('1,,2,', 5).pages, [1, 2]);

  for (const [input, fragment] of [['', 'Hãy nhập'], ['0', 'bắt đầu từ 1'], ['11', 'vượt quá'], ['3-12', 'vượt quá'], ['5-3', 'bị ngược'], ['a', 'không hợp lệ'], ['1-', 'không hợp lệ'], ['-2', 'không hợp lệ'], ['1.5', 'không hợp lệ'], [',', 'Hãy nhập']]) {
    const parsed = parsePageRange(input, 10);
    assert.deepEqual(parsed.pages, [], input);
    assert.match(parsed.error, new RegExp(fragment), input);
  }
  assert.match(parsePageRange('1', 0).error, /không có trang/);
});

test('page ranges format back without losing order', () => {
  assert.equal(formatPageRange([1, 2, 3, 5, 8]), '1-3,5,8');
  assert.equal(formatPageRange([5, 1, 2, 3]), '5,1-3');
  assert.equal(formatPageRange([3, 2, 1]), '3,2,1');
  assert.equal(formatPageRange([]), '');
  for (const text of ['1-3,5,8', '5,1-3', '9,2-4,1']) assert.equal(formatPageRange(parsePageRange(text, 10).pages), text);
  assert.deepEqual(togglePage([1, 3], 2), [1, 3, 2]);
  assert.deepEqual(togglePage([1, 3, 2], 3), [1, 2]);
});

test('file checks: sniffing, sizes, budgets, rejection text and moves', () => {
  assert.equal(sniffFileKind(makePng(2, 2)), 'png');
  assert.equal(sniffFileKind(makeJpegHeader(2, 2)), 'jpeg');
  assert.equal(sniffFileKind(new TextEncoder().encode('%PDF-1.7\n')), 'pdf');
  assert.equal(sniffFileKind(new TextEncoder().encode('junk\n%PDF-1.4')), 'pdf');
  assert.equal(sniffFileKind(new TextEncoder().encode('<html>')), '');
  assert.equal(sniffFileKind(new Uint8Array()), '');

  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1,5 KB');
  assert.equal(formatBytes(25 * 1024 * 1024), '25 MB');
  assert.equal(formatBytes(2.5 * 1024 * 1024), '2,5 MB');

  const file = (name, size) => ({ name, size });
  // A file over the size budget is skipped, but smaller ones after it still fit.
  const budget = fitFileBudget([file('a', 40), file('b', 40), file('c', 10), file('d', 1)], [file('x', 30)], { maxFiles: 3, maxTotalSize: 100 });
  assert.deepEqual(budget.accepted.map((item) => item.name), ['a', 'c']);
  assert.equal(budget.messages.length, 2);
  assert.match(budget.messages[0], /^b: tổng dung lượng/);
  assert.match(budget.messages[1], /^d: đã đạt tối đa 3 file/);

  const lines = describeRejections([
    { file: file('a.gif', 1), errors: [{ code: 'file-invalid-type' }] },
    { file: file('b.png', 1), errors: [{ code: 'file-too-large' }] },
    { file: file('c.png', 0), errors: [{ code: 'file-empty' }] },
  ], { label: 'JPG, PNG', maxFileSize: 25 * 1024 * 1024 });
  assert.deepEqual(lines, ['a.gif: không đúng định dạng (chỉ nhận JPG, PNG).', 'b.png: vượt quá 25 MB.', 'c.png: file rỗng.']);

  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  const same = ['a'];
  assert.equal(moveItem(same, 0, 1), same);
});

test('EXIF orientation is read in both byte orders and defaults to 1', () => {
  assert.equal(readJpegOrientation(makeJpegHeader(4, 3, 6)), 6);
  assert.equal(readJpegOrientation(makeJpegHeader(4, 3, 8, true)), 8);
  assert.equal(readJpegOrientation(makeJpegHeader(4, 3)), 1);
  assert.equal(readJpegOrientation(makeJpegHeader(4, 3, 9)), 1);
  assert.equal(readJpegOrientation(makePng(2, 2)), 1);
  assert.equal(readJpegOrientation(makeJpegHeader(4, 3, 6).subarray(0, 12)), 1);
});

test('image page layout: A4 orientation, margins, contain-fit and image-sized pages', () => {
  const landscape = computeImagePageLayout({ width: 4000, height: 3000 }, { pageSize: 'a4', orientation: 'auto', marginMm: 10 });
  assert.equal(landscape.orientation, 'l');
  assert.deepEqual([landscape.pageWidth, landscape.pageHeight], [297, 210]);
  close(landscape.height, 190);
  close(landscape.width, 190 * 4 / 3);
  close(landscape.x, (297 - landscape.width) / 2);
  close(landscape.y, 10);

  const forcedPortrait = computeImagePageLayout({ width: 4000, height: 3000 }, { pageSize: 'a4', orientation: 'portrait', marginMm: 0 });
  assert.equal(forcedPortrait.orientation, 'p');
  close(forcedPortrait.width, 210);
  close(forcedPortrait.height, 157.5);
  close(forcedPortrait.y, (297 - 157.5) / 2);

  const square = computeImagePageLayout({ width: 500, height: 500 }, { pageSize: 'a4', orientation: 'auto', marginMm: 20 });
  assert.equal(square.orientation, 'p');
  close(square.width, 170);

  const sized = computeImagePageLayout({ width: 960, height: 480 }, { pageSize: 'image', orientation: 'portrait', marginMm: 5 });
  close(sized.pageWidth, 254 + 10);
  close(sized.pageHeight, 127 + 10);
  assert.equal(sized.orientation, 'l');
  close(sized.x, 5);

  const huge = computeImagePageLayout({ width: 40000, height: 1000 }, { pageSize: 'image', orientation: 'auto', marginMm: 0 });
  assert.ok(huge.pageWidth <= 5080.01);
  close(huge.width / huge.height, 40);
});

test('render scale is capped to the canvas limits', () => {
  assert.deepEqual(fitRenderScale(595, 842, 150 / 72), { scale: 150 / 72, limited: false });
  const a0 = fitRenderScale(2384, 3370, 300 / 72);
  assert.equal(a0.limited, true);
  assert.ok(2384 * a0.scale * 3370 * a0.scale <= 16_777_216);
  assert.ok(3370 * a0.scale <= 8192);
  assert.ok(fitRenderScale(100, 20000, 1).scale <= 8192 / 20000);
});

test('serial queue runs one task at a time and clear() drops waiting tasks', async () => {
  const queue = createSerialQueue();
  let running = 0;
  let peak = 0;
  const order = [];
  const task = (id) => async () => {
    running += 1; peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push(id); running -= 1;
    return id;
  };
  const results = await Promise.all([queue.push(task(1)), queue.push(task(2)), queue.push(task(3))]);
  assert.deepEqual(results, [1, 2, 3]);
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(peak, 1);

  const first = queue.push(task(4));
  const dropped = queue.push(task(5));
  queue.clear();
  assert.equal(await first, 4);
  assert.equal(await dropped, null);
  await assert.rejects(queue.push(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await queue.push(async () => 'still works'), 'still works');
});

test('images become one page each, in order, with the chosen page size', async () => {
  const images = [
    { name: 'wide.png', bytes: makePng(400, 200), format: 'PNG', width: 400, height: 200 },
    { name: 'tall.jpg', bytes: makeJpegHeader(300, 600), format: 'JPEG', width: 300, height: 600 },
    { name: 'square.png', bytes: makePng(250, 250), format: 'PNG', width: 250, height: 250 },
  ];
  const items = images.map((image) => ({ name: image.name, load: async () => image }));
  const progress = [];

  const a4 = await buildImagesPdf(items, { pageSize: 'a4', orientation: 'auto', marginMm: 10 }, { onProgress: (done, total) => progress.push(`${done}/${total}`) });
  assert.equal(a4.type, 'application/pdf');
  assert.deepEqual(progress, ['1/3', '2/3', '3/3']);
  const a4Landscape = [Math.round(297 * MM_TO_PT), Math.round(210 * MM_TO_PT)];
  const a4Portrait = [Math.round(210 * MM_TO_PT), Math.round(297 * MM_TO_PT)];
  assert.deepEqual(await pageSizes(a4), [a4Landscape, a4Portrait, a4Portrait]);

  const portrait = await buildImagesPdf(items, { pageSize: 'a4', orientation: 'portrait', marginMm: 0 });
  assert.deepEqual(await pageSizes(portrait), [a4Portrait, a4Portrait, a4Portrait]);
  const landscape = await buildImagesPdf(items, { pageSize: 'a4', orientation: 'landscape', marginMm: 0 });
  assert.deepEqual(await pageSizes(landscape), [a4Landscape, a4Landscape, a4Landscape]);

  // 96 px/in: 400 px → 300 pt, plus 5 mm margins on each side.
  const margin = 5 * MM_TO_PT * 2;
  const sized = await buildImagesPdf(items, { pageSize: 'image', orientation: 'auto', marginMm: 5 });
  assert.deepEqual(await pageSizes(sized), [[300, 150], [225, 450], [188, 188]].map(([w, h]) => [Math.round(w + margin), Math.round(h + margin)]));

  const reversed = await buildImagesPdf([...items].reverse(), { pageSize: 'image', orientation: 'auto', marginMm: 0 });
  assert.deepEqual(await pageSizes(reversed), [[188, 188], [225, 450], [300, 150]]);
});

test('image PDF errors name the file and honour cancellation', async () => {
  const bad = [{ name: 'broken.png', load: async () => { throw new Error('ảnh bị hỏng'); } }];
  await assert.rejects(buildImagesPdf(bad, { pageSize: 'a4', orientation: 'auto', marginMm: 0 }), /broken\.png.*ảnh bị hỏng/);
  await assert.rejects(buildImagesPdf([], { pageSize: 'a4', orientation: 'auto', marginMm: 0 }), /Chưa có ảnh/);
  const controller = new AbortController();
  controller.abort();
  const ok = [{ name: 'a.png', load: async () => ({ bytes: makePng(2, 2), format: 'PNG', width: 2, height: 2 }) }];
  await assert.rejects(buildImagesPdf(ok, { pageSize: 'a4', orientation: 'auto', marginMm: 0 }, { signal: controller.signal }), { name: 'AbortError' });
});

test('merging keeps file order and every page', async () => {
  const first = new File([await makePdf([[100, 200], [101, 200]])], 'first.pdf', { type: 'application/pdf' });
  const second = new File([await makePdf([[300, 150]])], 'second.pdf', { type: 'application/pdf' });
  const third = new File([await makePdf([[400, 400], [401, 400], [402, 400]])], 'third.pdf', { type: 'application/pdf' });
  const progress = [];

  const merged = await mergePdfs([first, second, third], { onProgress: (done, total) => progress.push(`${done}/${total}`) });
  assert.equal(merged.pageCount, 6);
  assert.deepEqual(progress, ['1/3', '2/3', '3/3']);
  assert.deepEqual(await pageSizes(merged.blob), [[100, 200], [101, 200], [300, 150], [400, 400], [401, 400], [402, 400]]);

  const swapped = await mergePdfs([third, first]);
  assert.deepEqual(await pageSizes(swapped.blob), [[400, 400], [401, 400], [402, 400], [100, 200], [101, 200]]);
  await assert.rejects(mergePdfs([first]), /ít nhất 2 file/);
});

test('extracting pages follows the requested order', async () => {
  const source = new File([await makePdf([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [100 + n, 300]))], 'source.pdf');
  const picked = await extractPdfPages(source, parsePageRange('1-3,5,8', 8).pages);
  assert.equal(picked.pageCount, 5);
  assert.deepEqual(await pageSizes(picked.blob), [[101, 300], [102, 300], [103, 300], [105, 300], [108, 300]]);

  const reordered = await extractPdfPages(source, parsePageRange('8,1-2', 8).pages);
  assert.deepEqual(await pageSizes(reordered.blob), [[108, 300], [101, 300], [102, 300]]);

  await assert.rejects(extractPdfPages(source, [9]), /Trang 9 không tồn tại/);
  await assert.rejects(extractPdfPages(source, []), /Chưa chọn trang/);
});

test('broken, fake, empty and encrypted PDFs fail with readable messages', async () => {
  const good = new File([await makePdf([[100, 100]])], 'good.pdf');
  const fake = new File(['<html>not a pdf</html>'], 'fake.pdf');
  const empty = new File([], 'empty.pdf');
  const truncated = new File([new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog')], 'truncated.pdf');

  const encryptedDoc = await PDFDocument.create();
  encryptedDoc.addPage([100, 100]);
  encryptedDoc.context.trailerInfo.Encrypt = encryptedDoc.context.obj({ Filter: 'Standard', V: 2, R: 3 });
  const encrypted = new File([await encryptedDoc.save({ useObjectStreams: false })], 'locked.pdf');

  await assert.rejects(mergePdfs([good, fake]), /fake\.pdf.*không phải PDF/);
  await assert.rejects(mergePdfs([good, empty]), /empty\.pdf.*rỗng/);
  await assert.rejects(mergePdfs([good, truncated]), /truncated\.pdf.*bị hỏng/);
  await assert.rejects(mergePdfs([good, encrypted]), /locked\.pdf.*mã hóa/);
  await assert.rejects(extractPdfPages(encrypted, [1]), /mã hóa/);
});
