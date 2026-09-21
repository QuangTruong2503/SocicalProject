import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAuthForm } from './authValidation.js';

const valid = { username: 'Người dùng', email: '  user@example.com  ', password: 'secret123', confirmPassword: 'secret123' };

test('accepts trimmed emails for login and registration', () => {
  assert.deepEqual(validateAuthForm('login', valid), {});
  assert.deepEqual(validateAuthForm('register', valid), {});
});
test('rejects blank and malformed emails', () => {
  for (const email of ['', '   ', 'name@', 'name @example.com']) {
    assert.ok(validateAuthForm('login', { ...valid, email }).email);
  }
});
test('login requires a password without enforcing new-account length rules', () => {
  assert.ok(validateAuthForm('login', { ...valid, password: '' }).password);
  assert.deepEqual(validateAuthForm('login', { ...valid, password: 'short' }), {});
});
test('registration requires a name, minimum password length, and matching confirmation', () => {
  const errors = validateAuthForm('register', { ...valid, username: ' a ', password: '12345', confirmPassword: '' });
  assert.deepEqual(Object.keys(errors), ['username', 'password', 'confirmPassword']);
  assert.ok(validateAuthForm('register', { ...valid, confirmPassword: 'different' }).confirmPassword);
});
