import test from 'node:test';
import assert from 'node:assert/strict';
import { adminQuotationReturnPath, csvQuotationRows, formatQuotationDate, quotationHref, readAdminQuotationFilters, safeCsvText } from './adminQuotations.js';

test('URL filters validate kind/status/sort/creator and clamp page', () => {
  const filters = readAdminQuotationFilters(new URLSearchParams('kind=knm&status=draft&sort=evil&page=-3&creator=invalid&from=not-a-date'));
  assert.equal(filters.kind,'knm'); assert.equal(filters.status,''); assert.equal(filters.sort,'created_at');
  assert.equal(filters.creator,''); assert.equal(filters.page,0); assert.equal(filters.from,'');
  assert.equal(readAdminQuotationFilters(new URLSearchParams('page=3')).page,2);
});
test('quotation links use row kind and safe admin return paths preserve filters', () => {
  assert.equal(quotationHref({kind:'knm',id:'one'}),'/bao-gia-knm/one/chinh-sua');
  assert.equal(adminQuotationReturnPath('/admin/quotations?kind=knm&page=3','fallback'),'/admin/quotations?kind=knm&page=3');
  for (const bad of ['https://evil.invalid','//evil.invalid','/admin/quotations-evil','/other',null]) assert.equal(adminQuotationReturnPath(bad,'fallback'),'fallback');
  assert.equal(formatQuotationDate('2026-10-15'),'15/10/2026');
});
test('CSV strings cannot become spreadsheet formulas and amounts remain numeric', () => {
  for (const value of ['=SUM(A1)','+1','-1','@formula',' \t=2+2']) assert.ok(safeCsvText(value).startsWith("'"));
  const [row] = csvQuotationRows([{quotation_no:'001',kind:'standard',customer_name:'=danger',total:'123.45',phone:'0901234',status:'draft'}],{draft:'Bản nháp'});
  assert.equal(row[2],"'=danger"); assert.equal(row[5],123.45); assert.equal(row[7],'Bản nháp');
});
