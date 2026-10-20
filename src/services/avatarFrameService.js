import { supabase, supabaseConfig } from '../lib/supabase.js';
import { createServiceResult } from './serviceHelpers.js';
import { AVATAR_FRAME_BUCKET, avatarFrameFallbackUrl, avatarFrameImageUrl, validateAvatarFrameFile } from '../utils/avatarFrames.js';

const FRAME_SELECT = 'id, name, image_source, image_path, sort_order, is_active, created_at, updated_at, frame_type, image_format, fallback_path, width, height, file_size, frame_count, duration_ms';
const LEGACY_FRAME_SELECT = 'id, name, image_source, image_path, sort_order, is_active, created_at, updated_at';
const MISSING_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01']);
// Errors the avatar frame SQL raises on purpose carry a Vietnamese message meant for the UI.
const USER_ERROR_CODES = new Set(['42501', '22023', 'P0002', '40001']);
const MISSING_MESSAGE = 'Chức năng Khung Avatar chưa được cài đặt trên máy chủ (cần chạy migration avatar_frames).';
const INSPECT_FUNCTION = 'avatar-frame-inspect';

function toMessage(error, fallback) {
  if (MISSING_CODES.has(error?.code)) return MISSING_MESSAGE;
  if (USER_ERROR_CODES.has(error?.code) && error?.message) return error.message;
  return fallback;
}

function failure(error, fallback) {
  return { ...createServiceResult(null, toMessage(error, fallback)), code: error?.code ?? null };
}

/** Adds `image_url` / `fallback_url` so the UI never builds Storage URLs itself. */
export function withFrameImageUrl(row) {
  return {
    frame_type: 'static',
    ...row,
    image_url: avatarFrameImageUrl(row, supabaseConfig.url),
    fallback_url: avatarFrameFallbackUrl(row, supabaseConfig.url),
  };
}

function isMissingColumn(error) {
  return ['42703', 'PGRST204'].includes(error?.code);
}

/**
 * Active frames in display order: the catalog every signed-in user picks from.
 * Filtered explicitly so admins (who may read disabled rows) see the same list.
 * Falls back to the first migration's columns (static frames only) if the
 * animated-frames migration has not been applied yet.
 */
export async function listAvatarFrames() {
  const query = (select) => supabase
    .from('avatar_frames')
    .select(select)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  try {
    let { data, error } = await query(FRAME_SELECT);
    if (error && isMissingColumn(error)) ({ data, error } = await query(LEGACY_FRAME_SELECT));

    if (error) {
      console.error('[avatarFrameService] listAvatarFrames failed', error);
      return failure(error, 'Không tải được danh sách khung avatar.');
    }

    return createServiceResult((data ?? []).map(withFrameImageUrl));
  } catch (error) {
    console.error('[avatarFrameService] listAvatarFrames exception', error);
    return createServiceResult(null, 'Không tải được danh sách khung avatar.');
  }
}

/**
 * Saves the signed-in user's frame; null removes it. The server only accepts an active frame.
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<{ avatar_frame_id: string | null }>>}
 */
export async function setMyAvatarFrame(frameId) {
  try {
    const { data, error } = await supabase.rpc('set_my_avatar_frame', { p_frame_id: frameId || null });

    if (error) {
      console.error('[avatarFrameService] setMyAvatarFrame failed', error);
      return failure(error, 'Không lưu được khung avatar. Vui lòng thử lại.');
    }

    return createServiceResult({ avatar_frame_id: data?.avatar_frame_id ?? null });
  } catch (error) {
    console.error('[avatarFrameService] setMyAvatarFrame exception', error);
    return createServiceResult(null, 'Không lưu được khung avatar. Vui lòng thử lại.');
  }
}

async function adminRpc(name, params, fallback) {
  try {
    const { data, error } = await supabase.rpc(name, params);

    if (error) {
      console.error(`[avatarFrameService] ${name} failed`, error);
      return failure(error, fallback);
    }

    return createServiceResult(data);
  } catch (error) {
    console.error(`[avatarFrameService] ${name} exception`, error);
    return createServiceResult(null, fallback);
  }
}

/** Admin-only: every frame (disabled included) with `usage_count`. */
export async function adminListAvatarFrames() {
  const result = await adminRpc('admin_list_avatar_frames', {}, 'Không tải được danh sách khung avatar.');
  return result.error ? result : createServiceResult((result.data ?? []).map(withFrameImageUrl));
}

/**
 * Removes uploaded files. The bucket policy refuses files a frame still uses,
 * so this is safe to call for any path the client is unsure about.
 * @returns {Promise<boolean>}
 */
export async function discardFrameUploads(paths) {
  const list = (paths ?? []).filter(Boolean);
  if (!list.length) return true;
  try {
    const { error } = await supabase.storage.from(AVATAR_FRAME_BUCKET).remove(list);
    return !error;
  } catch {
    return false;
  }
}

export function getFrameInspectEndpoint() {
  const custom = import.meta.env?.VITE_AVATAR_FRAME_INSPECT_URL;
  return custom || `${String(supabaseConfig.url || '').replace(/\/+$/, '')}/functions/v1/${INSPECT_FUNCTION}`;
}

async function inspectOnServer(path) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { error: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' };

  let response;
  try {
    response = await fetch(getFrameInspectEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: supabaseConfig.publishableKey },
      body: JSON.stringify({ path }),
    });
  } catch {
    return { error: 'Không kết nối được dịch vụ kiểm tra khung trên máy chủ.' };
  }

  if (response.status === 404 && !response.headers.get('content-type')?.includes('json')) {
    return { error: 'Chưa triển khai Edge Function avatar-frame-inspect trên máy chủ.' };
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.info) {
    return { error: body?.error?.message || 'Máy chủ chưa kiểm tra được file. Vui lòng thử lại.', code: body?.error?.code };
  }
  return { info: body.info };
}

/**
 * Admin-only: checks a picked file in the browser, uploads it under a fresh name
 * and has the server inspect the stored bytes. Only server-recorded files can be
 * attached to a frame. A file that does not pass is removed again.
 * @param {File | Blob} file
 * @param {{ requireStatic?: boolean }} [options]  requireStatic: for fallbacks.
 * @returns {Promise<{ data: { path: string, info: object, local: object } | null, error: string | null }>}
 */
export async function uploadFrameFile(file, { requireStatic = false } = {}) {
  const checked = await validateAvatarFrameFile(file);
  if (checked.error) return createServiceResult(null, checked.error);
  if (requireStatic && checked.info.type !== 'static') {
    return createServiceResult(null, 'Ảnh dự phòng phải là ảnh PNG hoặc WebP tĩnh (không chuyển động).');
  }

  const path = `frames/${crypto.randomUUID()}.${checked.extension}`;
  try {
    const { error } = await supabase.storage.from(AVATAR_FRAME_BUCKET).upload(path, file, {
      contentType: checked.mime,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) {
      console.error('[avatarFrameService] upload failed', error);
      return createServiceResult(null, 'Không tải được ảnh khung lên Storage. Hãy kiểm tra kết nối và thử lại.');
    }
  } catch (error) {
    console.error('[avatarFrameService] upload exception', error);
    return createServiceResult(null, 'Không tải được ảnh khung lên Storage. Hãy kiểm tra kết nối và thử lại.');
  }

  const inspected = await inspectOnServer(path);
  if (inspected.error) {
    await discardFrameUploads([path]);
    return createServiceResult(null, inspected.error);
  }
  if (requireStatic && inspected.info.frame_type !== 'static') {
    await discardFrameUploads([path]);
    return createServiceResult(null, 'Ảnh dự phòng phải là ảnh PNG hoặc WebP tĩnh (không chuyển động).');
  }

  return createServiceResult({ path, info: inspected.info, local: checked.info });
}

/**
 * Admin-only: create a frame (`frame` null) or edit one. `imagePath` and
 * `fallbackPath` are files returned by uploadFrameFile(). After a successful
 * save, the files the frame no longer uses are removed.
 * @param {{ frame?: Object | null, name: string, isActive: boolean, imagePath?: string | null, fallbackPath?: string | null, removeFallback?: boolean }} input
 */
export async function adminSaveAvatarFrame({ frame = null, name, isActive, imagePath = null, fallbackPath = null, removeFallback = false }) {
  const result = await adminRpc('admin_save_avatar_frame', {
    p_id: frame?.id ?? null,
    p_document: {
      name: String(name ?? '').trim(),
      is_active: Boolean(isActive),
      ...(imagePath ? { image_path: imagePath } : {}),
      ...(fallbackPath ? { fallback_path: fallbackPath } : {}),
      ...(removeFallback ? { remove_fallback: true } : {}),
    },
  }, 'Không lưu được khung avatar. Vui lòng thử lại.');

  if (result.error) return result;

  const removed = result.data?.removed_paths ?? (result.data?.previous_image_path ? [result.data.previous_image_path] : []);
  const cleaned = await discardFrameUploads(removed);

  return createServiceResult(
    withFrameImageUrl(result.data.frame),
    null,
    cleaned ? null : 'Đã lưu khung nhưng chưa dọn được ảnh cũ khỏi Storage.',
  );
}

/**
 * Admin-only: delete a frame. Users on it fall back to no frame; its image and
 * fallback files are removed.
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<{ id: string, affected_users: number }>>}
 */
export async function adminDeleteAvatarFrame(frame) {
  const result = await adminRpc('admin_delete_avatar_frame', { p_id: frame.id }, 'Không xóa được khung avatar. Vui lòng thử lại.');
  if (result.error) return result;

  const removed = result.data?.removed_paths ?? (result.data?.image_path ? [result.data.image_path] : []);
  const cleaned = await discardFrameUploads(removed);
  return createServiceResult(
    { id: result.data.id, affected_users: Number(result.data.affected_users) || 0 },
    null,
    cleaned ? null : 'Đã xóa khung nhưng chưa dọn được ảnh khỏi Storage.',
  );
}

/** Admin-only: save the complete display order. */
export function adminReorderAvatarFrames(ids) {
  return adminRpc('admin_reorder_avatar_frames', { p_ids: ids }, 'Không lưu được thứ tự khung. Vui lòng thử lại.');
}
