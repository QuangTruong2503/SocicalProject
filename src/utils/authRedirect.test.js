import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAuthReturnPath, normalizeLocalPath } from './authRedirect.js';

globalThis.window = { location: { origin: 'https://app.example.com' } };

test('preserves local destination including query and fragment', () => {
  assert.equal(normalizeLocalPath('/bao-gia-knm?draft=1#item'), '/bao-gia-knm?draft=1#item');
});
test('rejects external redirects, invalid destinations, and auth loops', () => {
  for (const path of [null, '', '//evil.test', 'https://evil.test', 'javascript:alert(1)', '/auth', '/auth?next=/auth', '/auth/callback', '/AUTH/']) {
    assert.equal(normalizeLocalPath(path), '/dashboard', String(path));
  }
});
test('router state takes precedence, with query fallback for OAuth and email links', () => {
  assert.equal(getAuthReturnPath({ state: { from: '/aiseo' }, search: '?next=/dashboard' }), '/aiseo');
  assert.equal(getAuthReturnPath({ search: '?next=%2Fbao-gia-knm%3Fdraft%3D1' }), '/bao-gia-knm?draft=1');
  assert.equal(getAuthReturnPath({ search: '' }), '/dashboard');
});
