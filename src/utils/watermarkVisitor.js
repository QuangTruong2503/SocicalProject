const WATERMARK_VISITOR_COOKIE = 'watermark_visitor_id';
const WATERMARK_VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function readCookie(name) {
  if (typeof document === 'undefined') {
    return null;
  }

  const escapedName = name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function generateUuidV4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

function writeCookie(name, value) {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${WATERMARK_VISITOR_COOKIE_MAX_AGE}; samesite=lax`;
}

export function getWatermarkVisitorId() {
  return readCookie(WATERMARK_VISITOR_COOKIE);
}

export function getOrCreateWatermarkVisitorId() {
  const existingVisitorId = getWatermarkVisitorId();

  if (existingVisitorId) {
    return existingVisitorId;
  }

  const nextVisitorId = generateUuidV4();
  writeCookie(WATERMARK_VISITOR_COOKIE, nextVisitorId);
  return nextVisitorId;
}

