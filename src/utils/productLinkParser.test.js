import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLinkLabels, parseProductLinks } from './productLinkParser.js';

const BASE = 'https://cdn.hstatic.net/files/1000033760/file/';

test('heading lines followed by URL lines become products', () => {
  const text = [
    'KINGTONY 653532M',
    `${BASE}tuyp-3-4-den-kingtony-653532m-32mm-dau-luc-giac.jpg`,
    `${BASE}tuyp-3-4-den-kingtony-653532m-32mm-hang-thuc-te.jpg`,
    '',
    'KINGTONY 653536M',
    `${BASE}tuyp-3-4-den-kingtony-653536-36mm-khac-ma-san-pham.jpg`,
  ].join('\n');

  const result = parseProductLinks(text);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].code, 'KINGTONY 653532M');
  assert.equal(result.items[0].links.length, 2);
  assert.equal(result.items[1].links.length, 1);
  assert.equal(result.linkCount, 3);
  assert.deepEqual(result.orphanLinks, []);
});

test('code and links on one row (Excel/TSV), duplicates merged case-insensitively', () => {
  const text = [
    `KINGTONY 653538M\t${BASE}a.jpg\t${BASE}b.jpg`,
    `kingtony 653538m: ${BASE}b.jpg ${BASE}c.jpg`,
  ].join('\n');

  const result = parseProductLinks(text);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].links, [`${BASE}a.jpg`, `${BASE}b.jpg`, `${BASE}c.jpg`]);
});

test('links before any heading are reported, numbering is not a heading', () => {
  const result = parseProductLinks([`${BASE}x.jpg`, '1.', `${BASE}y.jpg`].join('\n'));
  assert.equal(result.items.length, 0);
  assert.deepEqual(result.orphanLinks, [`${BASE}x.jpg`, `${BASE}y.jpg`]);
});

test('labels strip the shared file-name prefix at a word boundary', () => {
  const labels = buildLinkLabels([
    `${BASE}tuyp-3-4-den-kingtony-653532m-32mm-dau-luc-giac.jpg`,
    `${BASE}tuyp-3-4-den-kingtony-653532m-32mm-dau-vuong.jpg`,
    `${BASE}tuyp-3-4-den-kingtony-653532m-32mm-hang-thuc-te.jpg`,
  ]);
  assert.deepEqual(labels, ['dau luc giac', 'dau vuong', 'hang thuc te']);
});
