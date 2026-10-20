import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_UPLOAD_LIMIT, validateAvatarFile } from './avatarUpload.js';

const file = (type, size) => ({ type, size, name: 'x' });

test('a new avatar must be a JPG, PNG or WebP between 1 byte and 10 MB', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(validateAvatarFile(file(type, 2048)), '');
  assert.equal(validateAvatarFile(file('image/png', AVATAR_UPLOAD_LIMIT)), '');
  for (const type of ['image/gif', 'image/svg+xml', 'image/heic', 'application/pdf', '']) {
    assert.match(validateAvatarFile(file(type, 2048)), /JPG, PNG hoặc WebP/);
  }
  assert.match(validateAvatarFile(file('image/png', AVATAR_UPLOAD_LIMIT + 1)), /10 MB/);
  assert.match(validateAvatarFile(file('image/png', 0)), /trống/);
  assert.match(validateAvatarFile(null), /chọn một ảnh/);
});
