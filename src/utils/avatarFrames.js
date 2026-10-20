// Avatar frames on the client: file checks, URLs and fallback generation.
// The byte-level rules are shared with the avatar-frame-inspect Edge Function,
// which repeats the check on the server before a file can be used.
import {
  AVATAR_FRAME_LIMITS,
  AVATAR_FRAME_RULES,
  checkFrameLimits,
  inspectFrameImage,
  validateFrameBytes,
} from '../../supabase/functions/avatar-frame-inspect/frameImage.js';
import { formatBytes } from './fileConvertChecks.js';

export { AVATAR_FRAME_LIMITS, AVATAR_FRAME_RULES, checkFrameLimits, inspectFrameImage, validateFrameBytes };

/** The frame image is this many times the avatar's diameter, centred on it. */
export const AVATAR_FRAME_SCALE = 1.3;
export const AVATAR_FRAME_BUCKET = 'avatar-frames';
export const AVATAR_FRAME_NAME_LIMIT = 60;
export const AVATAR_FRAME_ACCEPT = 'image/png,image/apng,image/webp';

const BUILTIN_PATH = /^[a-z0-9-]{1,64}\.(svg|png|webp)$/;
const STORAGE_PATH = /^frames\/[0-9a-f-]{36}\.(png|webp)$/;
const FORMAT_LABELS = { svg: 'SVG', png: 'PNG', apng: 'APNG', webp: 'WebP' };

export function frameFormatLabel(frame) {
  const format = frame?.image_format || frame?.format;
  const label = FORMAT_LABELS[format] || '';
  return format === 'webp' && (frame?.frame_type || frame?.type) === 'animated' ? 'WebP động' : label;
}

const formatSeconds = (ms) => `${(ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giây`;

/**
 * [label, value] rows describing a saved frame or a server-verified upload
 * (both use the snake_case columns of avatar_frames / avatar_frame_uploads).
 */
export function describeFrameMeta(meta) {
  if (!meta) return [];
  const animated = meta.frame_type === 'animated';
  const rows = [
    ['Loại', animated ? 'Động' : 'Tĩnh'],
    ['Định dạng', frameFormatLabel(meta) || '—'],
    ['Kích thước', meta.width ? `${meta.width} × ${meta.height}px` : '—'],
    ['Dung lượng', meta.file_size ? formatBytes(meta.file_size) : '—'],
  ];
  if (animated) {
    rows.push(['Số frame', String(meta.frame_count)], ['Chu kỳ', formatSeconds(meta.duration_ms)]);
  }
  return rows;
}

async function decodeInBrowser(file) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    const middle = Math.floor(bitmap.width / 2);
    return { width: bitmap.width, height: bitmap.height, centerAlpha: context.getImageData(middle, middle, 1, 1).data[3] };
  } finally {
    bitmap.close?.();
  }
}

/**
 * Checks a file an admin picked: real format, animation, alpha, size, dimensions,
 * frames and cycle length; then (in a browser) that it decodes and its centre is clear.
 * @param {File | Blob} file
 * @param {{ decode?: (file: Blob) => Promise<{ width: number, height: number, centerAlpha: number } | null> }} [options]
 * @returns {Promise<{ error: string, info?: object, mime?: string, extension?: string }>}
 */
export async function validateAvatarFrameFile(file, { decode = decodeInBrowser } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') return { error: 'Hãy chọn một file ảnh.' };
  if (!file.size || file.size > AVATAR_FRAME_LIMITS.maxBytes) {
    return { error: `Dung lượng cần từ 1 byte đến ${AVATAR_FRAME_LIMITS.maxBytes / 1024 / 1024} MB.` };
  }

  let result;
  try {
    result = validateFrameBytes(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { error: 'Không đọc được file ảnh.' };
  }
  if (result.error) return { error: result.error, info: result.info };

  try {
    const decoded = await decode(file);
    if (decoded) {
      if (decoded.width !== result.info.width || decoded.height !== result.info.height) return { error: 'Không đọc được ảnh. File có thể bị hỏng.' };
      if (decoded.centerAlpha > 16) return { error: 'Vùng giữa ảnh cần trong suốt để không che avatar.' };
    }
  } catch {
    return { error: 'Không đọc được ảnh. File có thể bị hỏng.' };
  }

  return {
    error: '',
    info: result.info,
    mime: result.info.format === 'webp' ? 'image/webp' : 'image/png',
    extension: result.info.format === 'webp' ? 'webp' : 'png',
  };
}

function framePathUrl(source, path, supabaseUrl) {
  if (typeof path !== 'string') return '';
  if (source === 'builtin' && BUILTIN_PATH.test(path)) return `/avatar-frames/${path}`;
  if (source === 'storage' && STORAGE_PATH.test(path) && supabaseUrl) {
    try {
      return `${new URL(supabaseUrl).origin}/storage/v1/object/public/${AVATAR_FRAME_BUCKET}/${path}`;
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * URL of a frame's image. Built-in frames ship with the app; uploaded ones live
 * in the public bucket. Anything that does not match the expected paths yields ''.
 */
export function avatarFrameImageUrl(frame, supabaseUrl) {
  return framePathUrl(frame?.image_source, frame?.image_path, supabaseUrl);
}

/** URL of an animated frame's still fallback ('' for static frames or a bad path). */
export function avatarFrameFallbackUrl(frame, supabaseUrl) {
  return frame?.frame_type === 'animated' ? framePathUrl(frame?.image_source, frame?.fallback_path, supabaseUrl) : '';
}

/** The active frame a profile points at, or null (no frame, disabled, deleted or unknown). */
export function resolveAvatarFrame(frameId, frames) {
  if (!frameId || !Array.isArray(frames)) return null;
  return frames.find((frame) => frame.id === frameId && frame.image_url) || null;
}

/** Props for UserAvatar's frame layer. `still` shows the fallback even for animated frames. */
export function frameLayerProps(frame, { still = false } = {}) {
  if (!frame?.image_url) return { frameSrc: '' };
  if (frame.frame_type !== 'animated') return { frameSrc: frame.image_url };
  return still && frame.fallback_url
    ? { frameSrc: frame.fallback_url }
    : { frameSrc: frame.image_url, frameFallbackSrc: frame.fallback_url || '' };
}

function opaqueCoverage(context, width, height) {
  const { data } = context.getImageData(0, 0, width, height);
  let total = 0;
  for (let i = 3; i < data.length; i += 4) total += data[i];
  return total;
}

/**
 * Builds a still PNG for an animated frame in the browser. With ImageDecoder
 * (Chromium) it picks the frame with the most visible pixels, since the first
 * frame may be empty; otherwise it uses the first frame. The admin sees it and
 * can replace it with their own still image.
 * @returns {Promise<{ blob: Blob, frameIndex: number, picked: 'most-visible' | 'first' } | null>}
 */
export async function createFallbackCandidate(file, info) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = info.width;
  canvas.height = info.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  let frameIndex = 0;
  let picked = 'first';

  if (typeof ImageDecoder === 'function') {
    try {
      const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: info.format === 'webp' ? 'image/webp' : 'image/png' });
      await decoder.tracks.ready;
      const count = Math.min(decoder.tracks.selectedTrack?.frameCount || 1, AVATAR_FRAME_LIMITS.maxFrames);
      let best = -1;
      for (let index = 0; index < count; index += 1) {
        const { image } = await decoder.decode({ frameIndex: index });
        context.clearRect(0, 0, info.width, info.height);
        context.drawImage(image, 0, 0, info.width, info.height);
        image.close();
        const coverage = opaqueCoverage(context, info.width, info.height);
        if (coverage > best) { best = coverage; frameIndex = index; }
      }
      const { image } = await decoder.decode({ frameIndex });
      context.clearRect(0, 0, info.width, info.height);
      context.drawImage(image, 0, 0, info.width, info.height);
      image.close();
      decoder.close();
      picked = 'most-visible';
    } catch {
      frameIndex = 0;
      picked = 'first';
    }
  }

  if (picked === 'first') {
    if (typeof createImageBitmap !== 'function') return null;
    const bitmap = await createImageBitmap(file);
    context.clearRect(0, 0, info.width, info.height);
    context.drawImage(bitmap, 0, 0, info.width, info.height);
    bitmap.close?.();
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? { blob, frameIndex, picked } : null;
}
