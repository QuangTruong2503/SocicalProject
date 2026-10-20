// Minimal PNG / APNG / WebP byte streams for testing the avatar frame checks.
// Structure, CRCs and timing are real; pixel data is not meant to be decoded.
function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data = new Uint8Array(0)) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

const IDAT = new Uint8Array([0x78, 0x9c, 0x63, 0, 0, 0, 1, 0, 1]);

function fctl(sequence, width, height, delayMs) {
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  view.setUint32(0, sequence);
  view.setUint32(4, width);
  view.setUint32(8, height);
  view.setUint16(20, delayMs);
  view.setUint16(22, 1000);
  return chunk('fcTL', data);
}

/**
 * Static PNG, or an APNG when `delays` (ms per frame) is given.
 * @param {{ width?: number, height?: number, colorType?: number, trns?: boolean, delays?: number[], declaredFrames?: number }} [options]
 */
export function pngBytes({ width = 256, height = 256, colorType = 6, trns = false, delays = null, declaredFrames } = {}) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = colorType;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header)];
  if (delays) {
    const actl = new Uint8Array(8);
    new DataView(actl.buffer).setUint32(0, declaredFrames ?? delays.length);
    parts.push(chunk('acTL', actl));
  }
  if (trns) parts.push(chunk('tRNS', new Uint8Array([0, 0])));
  let sequence = 0;
  if (delays) parts.push(fctl(sequence++, width, height, delays[0]));
  parts.push(chunk('IDAT', IDAT));
  for (const delay of (delays ?? []).slice(1)) {
    parts.push(fctl(sequence++, width, height, delay));
    const fdat = new Uint8Array(4 + IDAT.length);
    new DataView(fdat.buffer).setUint32(0, sequence++);
    fdat.set(IDAT, 4);
    parts.push(chunk('fdAT', fdat));
  }
  parts.push(chunk('IEND'));
  return concat(parts);
}

const fourcc = (text) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

function riffChunk(type, payload) {
  const out = new Uint8Array(8 + payload.length + (payload.length & 1));
  out.set(fourcc(type), 0);
  new DataView(out.buffer).setUint32(4, payload.length, true);
  out.set(payload, 8);
  return out;
}

function riff(chunks) {
  const body = concat([fourcc('WEBP'), ...chunks]);
  const out = concat([fourcc('RIFF'), new Uint8Array(4), body]);
  new DataView(out.buffer).setUint32(4, body.length, true);
  return out;
}

const uint24 = (value) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];

function vp8l(width, height, alpha) {
  const payload = new Uint8Array(10);
  payload[0] = 0x2f;
  new DataView(payload.buffer).setUint32(1, ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14) | ((alpha ? 1 : 0) << 28), true);
  return riffChunk('VP8L', payload);
}

/**
 * @param {{ kind?: 'VP8X' | 'VP8L' | 'VP8 ', width?: number, height?: number, alpha?: boolean, delays?: number[] }} [options]
 */
export function webpBytes({ kind = 'VP8X', width = 512, height = 512, alpha = true, delays = null } = {}) {
  if (kind === 'VP8L') return riff([vp8l(width, height, alpha)]);

  if (kind === 'VP8 ') {
    const payload = new Uint8Array(10);
    payload.set([0x9d, 0x01, 0x2a], 3);
    new DataView(payload.buffer).setUint16(6, width, true);
    new DataView(payload.buffer).setUint16(8, height, true);
    return riff([riffChunk('VP8 ', payload)]);
  }

  const header = new Uint8Array(10);
  header[0] = (alpha ? 0x10 : 0) | (delays ? 0x02 : 0);
  header.set(uint24(width - 1), 4);
  header.set(uint24(height - 1), 7);
  if (!delays) return riff([riffChunk('VP8X', header), vp8l(width, height, alpha)]);

  const frames = delays.map((delay) => {
    const frameHeader = new Uint8Array(16);
    frameHeader.set(uint24(width - 1), 6);
    frameHeader.set(uint24(height - 1), 9);
    frameHeader.set(uint24(delay), 12);
    return riffChunk('ANMF', concat([frameHeader, vp8l(width, height, alpha)]));
  });
  return riff([riffChunk('VP8X', header), riffChunk('ANIM', new Uint8Array(6)), ...frames]);
}

export const svgBytes = () => new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>');
export const gifBytes = () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04]);
