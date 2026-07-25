import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

const WATERMARK_IMAGE_COUNTS_TABLE = 'watermark_image_counts';
const WATERMARK_VISITOR_STATS_VIEW = 'watermark_visitor_stats';

/**
 * @param {{ userId?: string | null, visitorId?: string | null, displayName?: string | null, userColor?: string | null, imageCount: number, sourcePage?: string }} payload
 */
export async function createWatermarkImageCount({
  userId,
  visitorId,
  displayName = null,
  userColor = null,
  imageCount,
  sourcePage = 'watermark',
}) {
  try {
    const normalizedCount = Number(imageCount);
    const normalizedSourcePage = (sourcePage || 'watermark').trim();
    const normalizedVisitorId = (visitorId || '').trim();
    const normalizedDisplayName = (displayName || '').trim();
    const normalizedUserColor = (userColor || '').trim();

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
      display_name: normalizedDisplayName || null,
      user_color: normalizedUserColor || null,
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
 * Fetch watermark rows for the dashboard.
 *
 * @param {{ sourcePage?: string | null }} options
 */
export async function getWatermarkDashboardRows({ sourcePage = null } = {}) {
  try {
    let query = supabase
      .from(WATERMARK_IMAGE_COUNTS_TABLE)
      .select('visitor_id, user_id, display_name, source_page, image_count, created_at')
      .order('created_at', { ascending: false });

    if (sourcePage) {
      query = query.eq('source_page', sourcePage);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[watermarkImageCountService] getWatermarkDashboardRows error', { error, sourcePage });
      return createServiceResult(null, normalizeServiceError(error, 'Không thể tải dữ liệu dashboard watermark.'));
    }

    return createServiceResult(data || []);
  } catch (error) {
    console.error('[watermarkImageCountService] getWatermarkDashboardRows exception', { error, sourcePage });
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải dữ liệu dashboard watermark.'));
  }
}

/**
 * Fetch grouped watermark stats by visitor_id for the dashboard.
 *
 * @param {{ sourcePage?: string | null }} options
 */
export async function getWatermarkVisitorStatsRows({ sourcePage = null } = {}) {
  try {
    const { data, error } = await supabase
      .from(WATERMARK_VISITOR_STATS_VIEW)
      .select('visitor_id, user_id, display_name, total_images, entry_count, source_pages, last_seen_at');

    if (error) {
      console.error('[watermarkImageCountService] getWatermarkVisitorStatsRows error', { error, sourcePage });
      return createServiceResult(null, normalizeServiceError(error, 'Không thể tải dữ liệu thống kê watermark.'));
    }

    const rows = (data || []).filter((row) => {
      if (!sourcePage || sourcePage === 'all') {
        return true;
      }

      return Array.isArray(row.source_pages)
        ? row.source_pages.includes(sourcePage)
        : row.source_page === sourcePage;
    });

    return createServiceResult(rows);
  } catch (error) {
    console.error('[watermarkImageCountService] getWatermarkVisitorStatsRows exception', { error, sourcePage });
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải dữ liệu thống kê watermark.'));
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
