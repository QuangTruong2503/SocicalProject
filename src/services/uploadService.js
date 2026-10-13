import { supabase, supabaseConfig } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

/**
 * @typedef {Object} UserUpload
 * @property {number} id
 * @property {string} user_id
 * @property {string} image_url
 * @property {string | null} file_name
 * @property {string | null} created_at
 */

const uploadColumns = 'id, user_id, image_url, file_name, created_at';

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildStoragePath(userId, fileName) {
  return `${userId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

function getPublicUrl(objectPath) {
  const { data } = supabase.storage
    .from(supabaseConfig.uploadBucket)
    .getPublicUrl(objectPath);

  return data.publicUrl;
}

function extractStoragePath(imageUrl) {
  try {
    const url = new URL(imageUrl);
    const marker = `/storage/v1/object/public/${supabaseConfig.uploadBucket}/`;
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch (error) {
    console.warn('[uploadService] Unable to parse storage path from image URL', {
      imageUrl,
      error,
    });
    return null;
  }
}

/**
 * @param {{ userId: string, file: File }} payload
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<UserUpload & { storage_path: string }>>}
 */
export async function uploadImage({ userId, file }) {
  let storagePath = null;

  try {
    if (!userId) {
      return createServiceResult(null, 'A signed-in user is required to upload images.');
    }

    if (!file) {
      return createServiceResult(null, 'No file was provided for upload.');
    }

    storagePath = buildStoragePath(userId, file.name);

    console.debug('[uploadService] uploadImage start', {
      userId,
      bucket: supabaseConfig.uploadBucket,
      storagePath,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });

    const { error: uploadError } = await supabase.storage
      .from(supabaseConfig.uploadBucket)
      .upload(storagePath, file, {
        cacheControl: '3600',
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('[uploadService] storage upload failed', uploadError);
      return createServiceResult(null, normalizeServiceError(uploadError, 'Unable to upload the file.'));
    }

    const imageUrl = getPublicUrl(storagePath);

    const { data, error } = await supabase
      .from('user_uploads')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        file_name: file.name,
      })
      .select(uploadColumns)
      .single();

    if (error) {
      console.error('[uploadService] insert user_uploads row failed', error);

      await supabase.storage
        .from(supabaseConfig.uploadBucket)
        .remove([storagePath]);

      return createServiceResult(null, normalizeServiceError(error, 'Unable to save the uploaded image metadata.'));
    }

    console.debug('[uploadService] uploadImage success', {
      userId,
      uploadId: data.id,
      storagePath,
    });

    return createServiceResult({
      ...data,
      storage_path: storagePath,
    });
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to upload the file.');
    console.error('[uploadService] uploadImage exception', error);

    if (storagePath) {
      await supabase.storage
        .from(supabaseConfig.uploadBucket)
        .remove([storagePath]);
    }

    return createServiceResult(null, message);
  }
}

/**
 * One page of the user's uploads, newest first, plus the total count.
 * @param {string} userId
 * @param {{ limit?: number, offset?: number }} [options]
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<{ rows: UserUpload[], total: number }>>}
 */
export async function fetchUserUploadsPage(userId, { limit = 24, offset = 0 } = {}) {
  try {
    if (!userId) {
      return createServiceResult(null, 'Cần đăng nhập để xem ảnh đã tải lên.');
    }

    const { data, error, count } = await supabase
      .from('user_uploads')
      .select(uploadColumns, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[uploadService] fetchUserUploadsPage failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Không thể tải danh sách ảnh.'));
    }

    return createServiceResult({ rows: data ?? [], total: count ?? (data?.length ?? 0) });
  } catch (error) {
    console.error('[uploadService] fetchUserUploadsPage exception', error);
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải danh sách ảnh.'));
  }
}

/**
 * @param {string} userId
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<UserUpload | null>>}
 */
export async function fetchLatestUserUpload(userId) {
  try {
    if (!userId) {
      return createServiceResult(null, 'A signed-in user is required to fetch the latest upload.');
    }

    console.debug('[uploadService] fetchLatestUserUpload start', { userId });

    const { data, error } = await supabase
      .from('user_uploads')
      .select(uploadColumns)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[uploadService] fetchLatestUserUpload failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to fetch the latest upload.'));
    }

    console.debug('[uploadService] fetchLatestUserUpload success', {
      userId,
      found: Boolean(data),
    });

    return createServiceResult(data ?? null);
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to fetch the latest upload.');
    console.error('[uploadService] fetchLatestUserUpload exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * Deletes the row first, then the storage object. If the file cannot be removed
 * the result carries a warning; the reverse order would leave a row pointing to
 * a missing file whenever the row delete failed.
 * @param {{ uploadId: number, userId: string, imageUrl?: string | null }} payload
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<UserUpload>>}
 */
export async function deleteUpload({ uploadId, userId, imageUrl = null }) {
  try {
    if (!uploadId || !userId) {
      return createServiceResult(null, 'Thiếu thông tin ảnh cần xóa.');
    }

    const { data, error } = await supabase
      .from('user_uploads')
      .delete()
      .eq('id', uploadId)
      .eq('user_id', userId)
      .select(uploadColumns)
      .single();

    if (error) {
      console.error('[uploadService] deleteUpload failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Không thể xóa ảnh.'));
    }

    let warning = null;
    const targetImageUrl = data?.image_url || imageUrl;
    const storagePath = targetImageUrl ? extractStoragePath(targetImageUrl) : null;

    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from(supabaseConfig.uploadBucket)
        .remove([storagePath]);

      if (storageError) {
        warning = 'Ảnh đã được xóa khỏi danh sách nhưng file gốc chưa xóa được khỏi kho lưu trữ.';
        console.warn('[uploadService] deleteUpload storage cleanup warning', { uploadId, storagePath, storageError });
      }
    }

    return createServiceResult(data, null, warning);
  } catch (error) {
    console.error('[uploadService] deleteUpload exception', error);
    return createServiceResult(null, normalizeServiceError(error, 'Không thể xóa ảnh.'));
  }
}
