import test from 'node:test';
import assert from 'node:assert/strict';
import { gifBytes, pngBytes, svgBytes, webpBytes } from '../../tests/fixtures/frameImages.mjs';
import {
  AVATAR_FRAME_LIMITS,
  avatarFrameFallbackUrl,
  avatarFrameImageUrl,
  checkFrameLimits,
  frameLayerProps,
  inspectFrameImage,
  resolveAvatarFrame,
  validateAvatarFrameFile,
  validateFrameBytes,
} from './avatarFrames.js';

const file = (bytes, name = 'frame.png', type = 'image/png') => new File([bytes], name, { type });
const noDecode = async () => null;
const frames = (count, delay) => Array(count).fill(delay);

test('tells static PNG/WebP apart from APNG/animated WebP and reads frames and cycle length', () => {
  assert.deepEqual(inspectFrameImage(pngBytes()).info, {
    format: 'png', type: 'static', width: 256, height: 256, hasAlpha: true, frameCount: 1, durationMs: null, minFrameDelayMs: null, fileSize: pngBytes().length,
  });
  const apng = inspectFrameImage(pngBytes({ delays: frames(30, 80) })).info;
  assert.deepEqual([apng.format, apng.type, apng.frameCount, apng.durationMs, apng.minFrameDelayMs], ['apng', 'animated', 30, 2400, 80]);
  // An APNG that declares a single frame displays as a still PNG.
  assert.equal(inspectFrameImage(pngBytes({ delays: [100] })).info.type, 'static');

  const webp = inspectFrameImage(webpBytes({ delays: frames(24, 100) })).info;
  assert.deepEqual([webp.format, webp.type, webp.frameCount, webp.durationMs, webp.hasAlpha], ['webp', 'animated', 24, 2400, true]);
  assert.equal(inspectFrameImage(webpBytes()).info.type, 'static');
  assert.equal(inspectFrameImage(webpBytes({ kind: 'VP8L', width: 300, height: 300 })).info.width, 300);
  assert.equal(inspectFrameImage(webpBytes({ kind: 'VP8 ' })).info.hasAlpha, false);
  assert.equal(inspectFrameImage(pngBytes({ colorType: 2 })).info.hasAlpha, false);
  assert.equal(inspectFrameImage(pngBytes({ colorType: 2, trns: true })).info.hasAlpha, true);
});

test('refuses unsupported formats and damaged files with specific reasons', () => {
  for (const bytes of [svgBytes(), gifBytes(), new TextEncoder().encode('\u0000\u0000\u0000\u0018ftypmp42 video')]) {
    assert.equal(inspectFrameImage(bytes).code, 'unsupported');
  }
  const png = pngBytes({ delays: frames(4, 250) });
  assert.equal(inspectFrameImage(png.subarray(0, png.length - 20)).code, 'corrupt', 'truncated');
  const flipped = png.slice();
  flipped[40] ^= 0xff;
  assert.equal(inspectFrameImage(flipped).code, 'corrupt', 'CRC mismatch');
  assert.equal(inspectFrameImage(pngBytes({ delays: frames(4, 250), declaredFrames: 9 })).code, 'corrupt', 'frame count mismatch');
  const webp = webpBytes({ delays: frames(4, 250) });
  assert.equal(inspectFrameImage(webp.subarray(0, webp.length - 7)).code, 'corrupt');
  assert.equal(inspectFrameImage(new Uint8Array(0)).code, 'corrupt');
});

test('applies the shared limits: size, square, alpha, frames, cycle length and frame delay', () => {
  const limits = AVATAR_FRAME_LIMITS;
  assert.deepEqual([limits.maxBytes, limits.minSide, limits.maxSide, limits.maxFrames, limits.minDurationMs, limits.maxDurationMs], [2097152, 128, 512, 120, 1000, 10000]);
  const ok = inspectFrameImage(pngBytes({ delays: frames(30, 80) })).info;
  assert.equal(checkFrameLimits(ok), '');
  assert.match(checkFrameLimits({ ...ok, fileSize: limits.maxBytes + 1 }), /2 MB/);
  assert.match(checkFrameLimits({ ...ok, hasAlpha: false }), /trong suốt/);
  assert.match(checkFrameLimits({ ...ok, height: 255 }), /ảnh vuông/);
  assert.match(checkFrameLimits({ ...ok, width: 1024, height: 1024 }), /128 đến 512/);
  assert.match(checkFrameLimits({ ...ok, width: 64, height: 64 }), /128 đến 512/);
  assert.match(validateFrameBytes(pngBytes({ delays: frames(121, 20) })).error, /tối đa 120 frame/);
  assert.match(validateFrameBytes(webpBytes({ delays: frames(9, 100) })).error, /1 đến 10 giây.*0,9 giây/);
  assert.match(validateFrameBytes(webpBytes({ delays: frames(40, 260) })).error, /10,4 giây/);
  assert.match(validateFrameBytes(pngBytes({ delays: [10, 990, 1000] })).error, /ít nhất 20 ms/);
  assert.equal(validateFrameBytes(webpBytes({ width: 512, height: 512, delays: frames(120, 50) })).error, undefined);
});

test('validates the bytes of a picked file, not its name or MIME type', async () => {
  const apng = await validateAvatarFrameFile(file(pngBytes({ delays: frames(10, 100) })), { decode: noDecode });
  assert.deepEqual([apng.error, apng.mime, apng.extension, apng.info.type], ['', 'image/png', 'png', 'animated']);
  // An animated WebP renamed to .png is stored as WebP.
  assert.equal((await validateAvatarFrameFile(file(webpBytes({ delays: frames(10, 100) }), 'renamed.png'), { decode: noDecode })).extension, 'webp');
  assert.match((await validateAvatarFrameFile(file(svgBytes(), 'x.png'), { decode: noDecode })).error, /không phải PNG, APNG hoặc WebP/);
  assert.match((await validateAvatarFrameFile(file(gifBytes(), 'x.webp', 'image/webp'), { decode: noDecode })).error, /GIF/);
  assert.match((await validateAvatarFrameFile(file(new Uint8Array(0)), { decode: noDecode })).error, /1 byte/);
  assert.match((await validateAvatarFrameFile(null)).error, /chọn một file/);
});

test('when the browser can decode, a corrupt file or an opaque centre is rejected', async () => {
  const png = file(pngBytes());
  assert.equal((await validateAvatarFrameFile(png, { decode: async () => ({ width: 256, height: 256, centerAlpha: 0 }) })).error, '');
  assert.match((await validateAvatarFrameFile(png, { decode: async () => ({ width: 256, height: 256, centerAlpha: 255 }) })).error, /Vùng giữa/);
  assert.match((await validateAvatarFrameFile(png, { decode: async () => ({ width: 10, height: 10, centerAlpha: 0 }) })).error, /bị hỏng/);
  assert.match((await validateAvatarFrameFile(png, { decode: async () => { throw new Error('bad'); } })).error, /bị hỏng/);
});

test('image and fallback URLs only come from the expected built-in or bucket paths', () => {
  const url = 'https://project.test';
  const uploaded = 'frames/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp';
  assert.equal(avatarFrameImageUrl({ image_source: 'builtin', image_path: 'laurel.svg' }, url), '/avatar-frames/laurel.svg');
  assert.equal(avatarFrameImageUrl({ image_source: 'builtin', image_path: 'orbit-glow.png' }, url), '/avatar-frames/orbit-glow.png');
  assert.equal(avatarFrameImageUrl({ image_source: 'storage', image_path: uploaded }, `${url}/rest/v1`), `${url}/storage/v1/object/public/avatar-frames/${uploaded}`);
  assert.equal(avatarFrameFallbackUrl({ frame_type: 'animated', image_source: 'builtin', fallback_path: 'orbit-glow-still.png' }, url), '/avatar-frames/orbit-glow-still.png');
  assert.equal(avatarFrameFallbackUrl({ frame_type: 'static', image_source: 'builtin', fallback_path: 'x.png' }, url), '');
  for (const frame of [
    { image_source: 'builtin', image_path: '../secret.svg' },
    { image_source: 'builtin', image_path: 'https://evil.test/a.svg' },
    { image_source: 'builtin', image_path: 'clip.gif' },
    { image_source: 'storage', image_path: 'frames/x.svg' },
    { image_source: 'storage', image_path: 'frames/../../a.png' },
    { image_source: 'other', image_path: 'laurel.svg' },
    null,
  ]) {
    assert.equal(avatarFrameImageUrl(frame, url), '');
  }
});

test('frame layer props: static frames, animated frames with fallback, and the still variant for lists', () => {
  const animated = { id: 'a', frame_type: 'animated', image_url: '/a.png', fallback_url: '/a-still.png' };
  assert.deepEqual(frameLayerProps(null), { frameSrc: '' });
  assert.deepEqual(frameLayerProps({ id: 's', frame_type: 'static', image_url: '/s.svg' }), { frameSrc: '/s.svg' });
  assert.deepEqual(frameLayerProps(animated), { frameSrc: '/a.png', frameFallbackSrc: '/a-still.png' });
  assert.deepEqual(frameLayerProps(animated, { still: true }), { frameSrc: '/a-still.png' });
  assert.equal(resolveAvatarFrame('a', [animated]), animated);
  assert.equal(resolveAvatarFrame('gone', [animated]), null);
});
