import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

const WATERMARK_IMAGE_COUNTS_TABLE = 'watermark_image_counts';

/**
 * @param {{ userId?: string | null, visitorId?: string | null, imageCount: number, sourcePage?: string }} payload
 */
export async function createWatermarkImageCount({ userId, visitorId, imageCount, sourcePage = 'watermark' }) {
  try {
    const normalizedCount = Number(imageCount);
    const normalizedSourcePage = (sourcePage || 'watermark').trim();
    const normalizedVisitorId = (visitorId || '').trim();

    if (!Number.isFinite(normalizedCount) || normalizedCount <= 0) {
      return createServiceResult(null, 'Image count must be greater than zero.');
    }

    if (!normalizedVisitorId) {
      return createServiceResult(null, 'Visitor ID is required to save the watermark image count.');
    }

    if (!normalizedSourcePage) {
      return createServiceResult(null, 'Source page is required to save the watermark image count.');
    }

    const payload = {
      user_id: userId || null,
      visitor_id: normalizedVisitorId,
      source_page: normalizedSourcePage,
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

/**
 * @param {{ sourcePage?: string | null, visitorId?: string | null }} options
 */
export async function getWatermarkImageCountTotal({ sourcePage = null, visitorId = null } = {}) {
  try {
    let query = supabase
      .from(WATERMARK_IMAGE_COUNTS_TABLE)
      .select('image_count');

    if (sourcePage) {
      query = query.eq('source_page', sourcePage);
    }

    if (visitorId) {
      query = query.eq('visitor_id', visitorId);
    }

    const { data, error } = await query;

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
