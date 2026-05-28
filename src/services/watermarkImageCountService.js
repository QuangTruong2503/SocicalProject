import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

const WATERMARK_IMAGE_COUNTS_TABLE = 'watermark_image_counts';

export async function createWatermarkImageCount({ userId, imageCount }) {
  try {
    const normalizedCount = Number(imageCount);

    if (!Number.isFinite(normalizedCount) || normalizedCount <= 0) {
      return createServiceResult(null, 'Image count must be greater than zero.');
    }

    const payload = {
      user_id: userId || null,
      image_count: Math.floor(normalizedCount),
    };

    const { error } = await supabase
      .from(WATERMARK_IMAGE_COUNTS_TABLE)
      .insert([payload]);

    if (error) {
      console.error('[watermarkImageCountService] createWatermarkImageCount error', { error, payload });
      return createServiceResult(null, normalizeServiceError(error, 'Không thể lưu số lượng ảnh watermark.'));
    }

    return createServiceResult(payload);
  } catch (error) {
    console.error('[watermarkImageCountService] createWatermarkImageCount exception', { error });
    return createServiceResult(null, normalizeServiceError(error, 'Không thể lưu số lượng ảnh watermark.'));
  }
}

export async function getWatermarkImageCountTotal() {
  try {
    const { data, error } = await supabase
      .from(WATERMARK_IMAGE_COUNTS_TABLE)
      .select('image_count');

    if (error) {
      console.error('[watermarkImageCountService] getWatermarkImageCountTotal error', { error });
      return createServiceResult(null, normalizeServiceError(error, 'Không thể tải số lượng ảnh watermark.'));
    }

    const total = (data || []).reduce((sum, row) => sum + (Number(row.image_count) || 0), 0);
    return createServiceResult(total);
  } catch (error) {
    console.error('[watermarkImageCountService] getWatermarkImageCountTotal exception', { error });
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải số lượng ảnh watermark.'));
  }
}
