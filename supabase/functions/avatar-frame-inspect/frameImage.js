/**
 * Avatar frame image rules and byte-level inspection, shared by the Edge
 * Function (the trusted check) and the admin page (instant feedback). It lives
 * inside the function folder because the Supabase bundler only ships that
 * folder. Plain ESM with no runtime APIs, so Deno, Node tests and Vite all
 * import the same code.
 *
 * Supported: static PNG, APNG, static WebP, animated WebP — read from the bytes,
 * never from the file name or the MIME type the browser reports.
 */

export const AVATAR_FRAME_LIMITS = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  minSide: 128,
  maxSide: 512,
  maxFrames: 120,
  minDurationMs: 1000,
  maxDurationMs: 10000,
  // Shorter delays are rendered differently by each browser (0 ms often becomes 100 ms).
  minFrameDelayMs: 20,
});

export const AVATAR_FRAME_STORAGE_PATH = /^frames\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp)$/;

const MB = 1024 * 1024;
export const AVATAR_FRAME_RULES = Object.freeze([
  'PNG, WebP (tĩnh) hoặc APNG, WebP động; nền trong suốt. Không nhận SVG, GIF hay video.',
  `Ảnh vuông từ ${AVATAR_FRAME_LIMITS.minSide} × ${AVATAR_FRAME_LIMITS.minSide} đến ${AVATAR_FRAME_LIMITS.maxSide} × ${AVATAR_FRAME_LIMITS.maxSide}px, tối đa ${AVATAR_FRAME_LIMITS.maxBytes / MB} MB.`,
  `Khung động: tối đa ${AVATAR_FRAME_LIMITS.maxFrames} frame, một chu kỳ từ ${AVATAR_FRAME_LIMITS.minDurationMs / 1000} đến ${AVATAR_FRAME_LIMITS.maxDurationMs / 1000} giây, mỗi frame ít nhất ${AVATAR_FRAME_LIMITS.minFrameDelayMs} ms. Cần thêm ảnh tĩnh dự phòng.`,
  'Avatar nằm giữa, đường kính khoảng 77% cạnh ảnh: giữ vùng này trong suốt.',
]);

const ERRORS = {
  unsupported: 'File không phải PNG, APNG hoặc WebP. Không nhận SVG, GIF, video hay định dạng khác.',
  corrupt: 'File ảnh bị hỏng hoặc không đầy đủ.',
};

let crcTable;
function crc32(bytes, start, end) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = start; i < end; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
const fail = (code) => ({ error: ERRORS[code], code });

function inspectPng(bytes, view) {
  let offset = 8;
  let header = null;
  let hasAlpha = false;
  let declaredFrames = null;
  let frames = 0;
  let durationMs = 0;
  let minDelayMs = Infinity;
  let sawData = false;
  let ended = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return fail('corrupt');
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const data = offset + 8;
    const next = data + length + 4;
    if (next > bytes.length) return fail('corrupt');
    if (view.getUint32(data + length) !== crc32(bytes, offset + 4, data + length)) return fail('corrupt');

    if (!header) {
      if (type !== 'IHDR' || length !== 13) return fail('corrupt');
      const colorType = bytes[data + 9];
      header = { width: view.getUint32(data), height: view.getUint32(data + 4) };
      hasAlpha = colorType === 4 || colorType === 6;
    } else if (type === 'tRNS') {
      hasAlpha = true;
    } else if (type === 'acTL') {
      // The animation control chunk must come before the image data.
      if (sawData || length !== 8) return fail('corrupt');
      declaredFrames = view.getUint32(data);
    } else if (type === 'fcTL') {
      if (length !== 26) return fail('corrupt');
      const delayNum = view.getUint16(data + 20);
      const delayDen = view.getUint16(data + 22) || 100;
      const delayMs = (delayNum * 1000) / delayDen;
      frames += 1;
      durationMs += delayMs;
      minDelayMs = Math.min(minDelayMs, delayMs);
    } else if (type === 'IDAT') {
      sawData = true;
    } else if (type === 'IEND') {
      ended = true;
      offset = next;
      break;
    }

    offset = next;
  }

  if (!header || !sawData || !ended) return fail('corrupt');

  const animated = declaredFrames !== null && declaredFrames >= 2;
  if (declaredFrames !== null && declaredFrames !== frames) return fail('corrupt');

  return {
    info: {
      format: animated ? 'apng' : 'png',
      type: animated ? 'animated' : 'static',
      width: header.width,
      height: header.height,
      hasAlpha,
      frameCount: animated ? frames : 1,
      durationMs: animated ? Math.round(durationMs) : null,
      minFrameDelayMs: animated ? minDelayMs : null,
      fileSize: bytes.length,
    },
  };
}

function vp8Size(bytes, view, data, length) {
  if (length < 10 || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return null;
  return { width: view.getUint16(data + 6, true) & 0x3fff, height: view.getUint16(data + 8, true) & 0x3fff };
}

function vp8lSize(bytes, view, data, length) {
  if (length < 5 || bytes[data] !== 0x2f) return null;
  const bits = view.getUint32(data + 1, true);
  return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: Boolean((bits >>> 28) & 1) };
}

function inspectWebp(bytes, view) {
  const riffEnd = view.getUint32(4, true) + 8;
  if (riffEnd > bytes.length || riffEnd < 20) return fail('corrupt');

  const chunks = [];
  for (let offset = 12; offset < riffEnd;) {
    if (offset + 8 > riffEnd) return fail('corrupt');
    const length = view.getUint32(offset + 4, true);
    const next = offset + 8 + length + (length & 1);
    if (offset + 8 + length > riffEnd) return fail('corrupt');
    chunks.push({ type: ascii(bytes, offset, 4), data: offset + 8, length });
    offset = next;
  }

  const [first] = chunks;
  if (!first) return fail('corrupt');
  const result = (size, hasAlpha, extra = {}) => ({
    info: {
      format: 'webp',
      type: 'static',
      width: size.width,
      height: size.height,
      hasAlpha,
      frameCount: 1,
      durationMs: null,
      minFrameDelayMs: null,
      fileSize: bytes.length,
      ...extra,
    },
  });

  if (first.type === 'VP8 ') {
    const size = vp8Size(bytes, view, first.data, first.length);
    return size ? result(size, false) : fail('corrupt');
  }

  if (first.type === 'VP8L') {
    const size = vp8lSize(bytes, view, first.data, first.length);
    return size ? result(size, size.alpha) : fail('corrupt');
  }

  if (first.type !== 'VP8X' || first.length < 10) return fail('corrupt');
  const flags = bytes[first.data];
  const canvas = {
    width: 1 + (bytes[first.data + 4] | (bytes[first.data + 5] << 8) | (bytes[first.data + 6] << 16)),
    height: 1 + (bytes[first.data + 7] | (bytes[first.data + 8] << 8) | (bytes[first.data + 9] << 16)),
  };
  const hasAlpha = Boolean(flags & 0x10);

  if (!(flags & 0x02)) {
    if (!chunks.some((chunk) => chunk.type === 'VP8 ' || chunk.type === 'VP8L')) return fail('corrupt');
    return result(canvas, hasAlpha);
  }

  if (!chunks.some((chunk) => chunk.type === 'ANIM')) return fail('corrupt');
  const frames = chunks.filter((chunk) => chunk.type === 'ANMF');
  if (!frames.length) return fail('corrupt');

  let durationMs = 0;
  let minDelayMs = Infinity;
  for (const frame of frames) {
    if (frame.length < 16 + 8) return fail('corrupt');
    const inner = ascii(bytes, frame.data + 16, 4);
    if (!['VP8 ', 'VP8L', 'ALPH'].includes(inner)) return fail('corrupt');
    const delayMs = bytes[frame.data + 12] | (bytes[frame.data + 13] << 8) | (bytes[frame.data + 14] << 16);
    durationMs += delayMs;
    minDelayMs = Math.min(minDelayMs, delayMs);
  }

  const animated = frames.length >= 2;
  return result(canvas, hasAlpha, animated
    ? { type: 'animated', frameCount: frames.length, durationMs, minFrameDelayMs: minDelayMs }
    : {});
}

/**
 * Reads format, size, alpha and animation timing from the complete file bytes.
 * Checks chunk structure (and PNG CRCs) so truncated or damaged files are refused.
 * @param {Uint8Array} bytes
 * @returns {{ info: { format: 'png' | 'apng' | 'webp', type: 'static' | 'animated', width: number, height: number,
 *   hasAlpha: boolean, frameCount: number, durationMs: number | null, minFrameDelayMs: number | null, fileSize: number } }
 *   | { error: string, code: 'unsupported' | 'corrupt' }}
 */
export function inspectFrameImage(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 16) return fail(bytes?.length ? 'unsupported' : 'corrupt');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return inspectPng(bytes, view);
  }

  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return inspectWebp(bytes, view);
  }

  return fail('unsupported');
}

const seconds = (ms) => `${(ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giây`;

/** @returns {string} A Vietnamese reason the image breaks a rule, or '' when it is accepted. */
export function checkFrameLimits(info) {
  const limits = AVATAR_FRAME_LIMITS;
  if (!info.fileSize || info.fileSize > limits.maxBytes) return `Dung lượng cần từ 1 byte đến ${limits.maxBytes / MB} MB.`;
  if (!info.hasAlpha) return 'Ảnh khung cần có nền trong suốt (kênh alpha).';
  if (info.width !== info.height) return `Ảnh khung cần là ảnh vuông (ảnh này ${info.width} × ${info.height}px).`;
  if (info.width < limits.minSide || info.width > limits.maxSide) {
    return `Cạnh ảnh cần từ ${limits.minSide} đến ${limits.maxSide}px (ảnh này ${info.width}px).`;
  }
  if (info.type === 'animated') {
    if (info.frameCount > limits.maxFrames) return `Khung động tối đa ${limits.maxFrames} frame (file này ${info.frameCount} frame).`;
    if (info.durationMs < limits.minDurationMs || info.durationMs > limits.maxDurationMs) {
      return `Một chu kỳ cần từ ${limits.minDurationMs / 1000} đến ${seconds(limits.maxDurationMs)} (file này ${seconds(info.durationMs)}).`;
    }
    if (info.minFrameDelayMs < limits.minFrameDelayMs) return `Mỗi frame cần hiển thị ít nhất ${limits.minFrameDelayMs} ms.`;
  }
  return '';
}

/** inspectFrameImage + checkFrameLimits. */
export function validateFrameBytes(bytes) {
  const inspected = inspectFrameImage(bytes);
  if (inspected.error) return inspected;
  const error = checkFrameLimits(inspected.info);
  return error ? { error, code: 'limits', info: inspected.info } : inspected;
}
