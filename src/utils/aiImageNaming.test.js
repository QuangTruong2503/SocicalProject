import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeSuggestedName,
  matchItemsById,
  renderPromptTemplate,
} from '../../supabase/functions/suggest-image-names/imageNaming.js';
import {
  buildFinalFileNames,
  chunkArray,
  extensionForMimeType,
  parseSuggestionResponse,
  runWithConcurrency,
  slugifyFileName,
} from './aiImageNaming.js';
import { getUniqueFileNames } from '../hooks/useWatermarkProcessor.js';

const jpeg = { type: 'image/jpeg' };

test('slug: Vietnamese, product codes and special characters', () => {
  assert.equal(slugifyFileName('Máy khoan Bosch GSB 13 RE'), 'may-khoan-bosch-gsb-13-re');
  assert.equal(slugifyFileName('Đèn LED Điện Quang ĐQ-LEDBU11 9W'), 'den-led-dien-quang-dq-ledbu11-9w');
  assert.equal(slugifyFileName('  --Kìm/cắt: "PRO" #A-12_B?? --  '), 'kim-cat-pro-a-12-b');
  assert.equal(slugifyFileName('Ổ cắm   3 lỗ\t(2.5mm²)'), 'o-cam-3-lo-2-5mm2');
  assert.equal(slugifyFileName('Ống thép Ø 21 – mạ kẽm'), 'ong-thep-21-ma-kem');
  assert.equal(slugifyFileName('!!!'), '');
  assert.equal(slugifyFileName(null), '');
});

test('slug: long names are cut at a hyphen, never leaving one at the end', () => {
  const slug = slugifyFileName('mot hai ba bon nam sau bay tam chin muoi', 20);
  assert.ok(slug.length <= 20);
  assert.equal(slug, 'mot-hai-ba-bon-nam');
  assert.equal(slugifyFileName('abcdefghijklmnopqrstuvwxyz', 10), 'abcdefghij');
});

test('composed name keeps the product name as the root and adds the descriptor', () => {
  assert.deepEqual(
    composeSuggestedName({ productName: 'Máy khoan Bosch GSB 13 RE', descriptor: 'Đầu kẹp', position: 2 }),
    { suggestedName: 'may-khoan-bosch-gsb-13-re-dau-kep', needsReview: false },
  );
  // Model repeated the product name — it is not doubled.
  assert.equal(
    composeSuggestedName({ productName: 'Máy khoan Bosch GSB 13 RE', descriptor: 'may khoan bosch gsb 13 re toàn cảnh', position: 1 }).suggestedName,
    'may-khoan-bosch-gsb-13-re-toan-canh',
  );
  // Long descriptors are capped to a few words.
  assert.equal(
    composeSuggestedName({ productName: 'Kìm', descriptor: 'một hai ba bốn năm sáu bảy tám chín', position: 1 }).suggestedName,
    'kim-mot-hai-ba-bon-nam-sau-bay-tam',
  );
});

test('longer meaningful descriptors survive normalization; uncertain model matches keep the supplied product name and review flag', () => {
  const named = composeSuggestedName({
    productName: 'Máy mài Makita 9556HB', descriptor: 'Công tắc trên thân máy nhìn từ trên', position: 12,
  });
  assert.equal(named.suggestedName, 'may-mai-makita-9556hb-cong-tac-tren-than-may-nhin-tu-tren');
  const uncertain = composeSuggestedName({
    productName: 'Máy mài Makita 9556HB', descriptor: 'Tem model trên thân máy', position: 15, needsReview: true,
  });
  const final = buildFinalFileNames([{ id: 'res-15', fileName: 'original.jpg', blob: jpeg }], { 'res-15': uncertain.suggestedName });
  assert.equal(final.get('res-15'), 'may-mai-makita-9556hb-tem-model-tren-than-may.jpg');
  assert.equal(uncertain.needsReview, true);
});

test('unclear image falls back to product name + position and is flagged', () => {
  assert.deepEqual(
    composeSuggestedName({ productName: 'Máy khoan Bosch GSB 13 RE', descriptor: '', position: 3 }),
    { suggestedName: 'may-khoan-bosch-gsb-13-re-3', needsReview: true },
  );
  assert.equal(composeSuggestedName({ productName: 'Kìm', descriptor: '???', position: 0 }).suggestedName, 'kim-1');
  assert.equal(composeSuggestedName({ productName: 'Kìm', descriptor: 'mặt sau', position: 4, needsReview: true }).needsReview, true);
});

test('matching by ID ignores order, unknown and duplicate IDs', () => {
  const result = matchItemsById(['a', 'b', 'c'], [
    { imageId: 'c', descriptor: 'C' },
    { imageId: 'zzz', descriptor: 'lạ' },
    { imageId: 'a', descriptor: 'A' },
    { imageId: 'a', descriptor: 'A2' },
    null,
    'text',
  ]);
  assert.deepEqual([...result.matched.keys()].sort(), ['a', 'c']);
  assert.equal(result.matched.get('a').descriptor, 'A');
  assert.deepEqual(result.missingIds, ['b']);
  assert.equal(result.unknownCount, 3);
  assert.equal(result.duplicateCount, 1);
  assert.deepEqual(matchItemsById(['a'], undefined).missingIds, ['a']);
});

test('client re-validates server items: shuffled, unknown, duplicate and unusable names', () => {
  const { suggestions, failedIds } = parseSuggestionResponse(['res-1', 'res-2', 'res-3', 'res-4'], {
    items: [
      { imageId: 'res-3', suggestedName: 'kim-mat-sau', needsReview: false },
      { imageId: 'res-1', suggestedName: 'Kìm Toàn Cảnh!!', needsReview: true },
      { imageId: 'res-1', suggestedName: 'kim-khac' },
      { imageId: 'res-99', suggestedName: 'la' },
      { imageId: 'res-4', suggestedName: '***' },
    ],
  });
  assert.deepEqual(Object.fromEntries(suggestions), {
    'res-3': { name: 'kim-mat-sau', needsReview: false },
    'res-1': { name: 'kim-toan-canh', needsReview: true },
  });
  assert.deepEqual(failedIds, ['res-2', 'res-4']);
});

test('final names: extension from the output, duplicates get stable suffixes', () => {
  const results = [
    { id: 'r1', fileName: 'anh_01.jpg', blob: jpeg },
    { id: 'r2', fileName: 'anh_02.jpg', blob: jpeg },
    { id: 'r3', fileName: 'kim-toan-canh.jpg', blob: jpeg }, // not renamed, keeps its name
    { id: 'r4', fileName: 'anh_04.jpg', blob: { type: 'image/png' } },
    { id: 'r5', fileName: 'anh_05.jpg', blob: jpeg },
  ];
  const names = buildFinalFileNames(results, {
    r1: 'Kìm toàn cảnh',
    r2: 'kim-toan-canh',
    r4: 'kim-mat-sau',
    r5: '   ',
  }, { productName: 'Kìm' });

  assert.deepEqual(Object.fromEntries(names), {
    r1: 'kim-toan-canh-2.jpg',
    r2: 'kim-toan-canh-3.jpg',
    r4: 'kim-mat-sau.png',
    r5: 'kim-5.jpg',
  });
  // Same input → same output.
  assert.deepEqual(Object.fromEntries(buildFinalFileNames(results, { r1: 'Kìm toàn cảnh', r2: 'kim-toan-canh', r4: 'kim-mat-sau', r5: '   ' }, { productName: 'Kìm' })), Object.fromEntries(names));
});

test('renamed results are what single downloads and the ZIP use', () => {
  const results = [
    { id: 'r1', fileName: 'anh_01.jpg', blob: jpeg },
    { id: 'r2', fileName: 'anh_02.jpg', blob: jpeg },
  ];
  const names = buildFinalFileNames(results, { r2: 'may-khoan-dau-kep', r1: 'may-khoan-toan-canh' });
  const renamed = results.map((result) => (names.has(result.id) ? { ...result, fileName: names.get(result.id) } : result));
  assert.deepEqual(getUniqueFileNames(renamed), ['may-khoan-toan-canh.jpg', 'may-khoan-dau-kep.jpg']);
});

test('helpers: extension, chunking, bounded concurrency, prompt template', async () => {
  assert.equal(extensionForMimeType('image/jpeg'), 'jpg');
  assert.equal(extensionForMimeType('image/webp'), 'webp');
  assert.equal(extensionForMimeType(undefined), 'jpg');
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5, 6, 7], 3), [[1, 2, 3], [4, 5, 6], [7]]);

  let active = 0;
  let peak = 0;
  const seen = [];
  await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    seen.push(item);
    active -= 1;
  });
  assert.equal(peak, 2);
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5]);

  assert.equal(renderPromptTemplate('Tên: {{productName}} / {{ productName }}', 'Kìm'), 'Tên: Kìm / Kìm');
});
