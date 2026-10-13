import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

const WATERMARK_IMAGE_COUNTS_TABLE = 'watermark_image_counts';
const WATERMARK_BROADCAST_TOPIC = 'watermark-image-counts';
// Matches the watermark_image_counts_image_count_max check constraint.
const MAX_IMAGES_PER_ROW = 1000;
const STATS_RPC_MISSING_MESSAGE = 'Chưa tạo RPC thống kê watermark trên Supabase. Hãy chạy supabase_watermark_stats_rpc.sql.';

/**
 * PostgREST answers PGRST202 when the RPC does not exist (SQL not applied yet).
 *
 * @param {any} error
 * @param {string} fallbackMessage
 */
function toStatsError(error, fallbackMessage) {
  if (error?.code === 'PGRST202') {
    return STATS_RPC_MISSING_MESSAGE;
  }

  if (error?.code === '42501') {
    return 'Chỉ quản trị viên mới xem được thống kê watermark.';
  }

  return normalizeServiceError(error, fallbackMessage);
}

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

    // The table caps one row at MAX_IMAGES_PER_ROW, so a big batch becomes several rows.
    const rows = [];
    for (let remaining = payload.image_count; remaining > 0; remaining -= MAX_IMAGES_PER_ROW) {
      rows.push({ ...payload, image_count: Math.min(remaining, MAX_IMAGES_PER_ROW) });
    }

    const { error } = await supabase
      .from(WATERMARK_IMAGE_COUNTS_TABLE)
      .insert(rows);

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
 * Total images, summed server-side (public RPC).
 *
 * @param {{ sourcePage?: string | null, visitorId?: string | null }} options
 */
export async function getWatermarkImageCountTotal({ sourcePage = null, visitorId = null } = {}) {
  try {
    const { data, error } = await supabase.rpc('watermark_image_count_total', {
      p_source_page: sourcePage,
      p_visitor_id: visitorId,
    });

    if (error) {
      console.error('[watermarkImageCountService] getWatermarkImageCountTotal error', { error, sourcePage, visitorId });
      return createServiceResult(null, toStatsError(error, 'Không thể tải số lượng ảnh watermark.'));
    }

    return createServiceResult(Number(data) || 0);
  } catch (error) {
    console.error('[watermarkImageCountService] getWatermarkImageCountTotal exception', { error, sourcePage, visitorId });
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải số lượng ảnh watermark.'));
  }
}

/**
 * Total images created by the signed-in account (all devices, all sources),
 * the same number /dashboard/overview shows.
 */
export async function getMyWatermarkImageTotal() {
  try {
    const { data, error } = await supabase.rpc('my_watermark_image_total');

    if (error) {
      console.error('[watermarkImageCountService] getMyWatermarkImageTotal error', { error });
      return createServiceResult(null, toStatsError(error, 'Không thể tải số ảnh của bạn.'));
    }

    return createServiceResult(Number(data) || 0);
  } catch (error) {
    console.error('[watermarkImageCountService] getMyWatermarkImageTotal exception', { error });
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải số ảnh của bạn.'));
  }
}

function normalizeSummary(summary) {
  if (!summary) {
    return null;
  }

  return {
    totalImages: Number(summary.total_images) || 0,
    totalEntries: Number(summary.total_entries) || 0,
    uniqueVisitors: Number(summary.unique_visitors) || 0,
    uniqueUsers: Number(summary.unique_users) || 0,
  };
}

/**
 * Admin-only: summary tiles, time series and the list of sources.
 *
 * @param {{ sourcePage?: string | null, from?: string | null, to?: string | null, bucket?: 'day' | 'week' | 'month' }} options
 */
export async function getWatermarkAdminOverview({ sourcePage = null, from = null, to = null, bucket = 'day' } = {}) {
  try {
    const { data, error } = await supabase.rpc('watermark_admin_overview', {
      p_source_page: sourcePage,
      p_from: from,
      p_to: to,
      p_bucket: bucket,
    });

    if (error) {
      console.error('[watermarkImageCountService] getWatermarkAdminOverview error', { error });
      return createServiceResult(null, toStatsError(error, 'Không thể tải tổng quan watermark.'));
    }

    return createServiceResult({
      bucket: data?.bucket || bucket,
      summary: normalizeSummary(data?.summary),
      previous: normalizeSummary(data?.previous),
      series: (data?.series || []).map((point) => ({
        bucket: point.bucket,
        images: Number(point.images) || 0,
        entries: Number(point.entries) || 0,
      })),
      sources: (data?.sources || []).map((source) => ({
        sourcePage: source.source_page,
        images: Number(source.images) || 0,
        entries: Number(source.entries) || 0,
      })),
    });
  } catch (error) {
    console.error('[watermarkImageCountService] getWatermarkAdminOverview exception', { error });
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải tổng quan watermark.'));
  }
}

/**
 * Admin-only: one row per visitor (or per account), filtered, sorted and paged server-side.
 *
 * @param {{
 *   sourcePage?: string | null, from?: string | null, to?: string | null, search?: string,
 *   groupBy?: 'visitor' | 'user', sort?: string, desc?: boolean, limit?: number, offset?: number,
 * }} options
 */
export async function getWatermarkVisitorStats({
  sourcePage = null,
  from = null,
  to = null,
  search = '',
  groupBy = 'visitor',
  sort = 'total_images',
  desc = true,
  limit = 50,
  offset = 0,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('watermark_visitor_stats', {
      p_source_page: sourcePage,
      p_from: from,
      p_to: to,
      p_search: search.trim() || null,
      p_group_by: groupBy,
      p_sort: sort,
      p_desc: desc,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('[watermarkImageCountService] getWatermarkVisitorStats error', { error });
      return createServiceResult(null, toStatsError(error, 'Không thể tải danh sách visitor watermark.'));
    }

    const rows = (data || []).map((row) => ({
      key: row.group_key,
      visitorId: row.visitor_id || '',
      visitorCount: Number(row.visitor_count) || 0,
      userId: row.user_id || '',
      displayName: row.display_name || '',
      userEmail: row.user_email || '',
      userName: row.user_name || '',
      totalImages: Number(row.total_images) || 0,
      entryCount: Number(row.entry_count) || 0,
      sourcePages: Array.isArray(row.source_pages) ? row.source_pages : [],
      firstSeenAt: row.first_seen_at || '',
      lastSeenAt: row.last_seen_at || '',
    }));

    return createServiceResult({
      rows,
      totalCount: Number(data?.[0]?.total_count) || 0,
    });
  } catch (error) {
    console.error('[watermarkImageCountService] getWatermarkVisitorStats exception', { error });
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải danh sách visitor watermark.'));
  }
}

/**
 * Live inserts, published by a DB trigger on a public Broadcast topic
 * (see supabase_watermark_image_counts_realtime.sql). The payload carries only
 * visitor_id, image_count and source_page.
 *
 * @param {(event: { visitorId: string, imageCount: number, sourcePage: string }) => void} onInsert
 * @param {(status: string) => void} [onStatus] Realtime channel status, e.g. 'SUBSCRIBED'
 * @returns {() => void} unsubscribe
 */
export function subscribeToWatermarkImageCounts(onInsert, onStatus) {
  const channel = supabase
    .channel(WATERMARK_BROADCAST_TOPIC)
    .on('broadcast', { event: 'insert' }, ({ payload }) => {
      const imageCount = Number(payload?.image_count) || 0;

      if (imageCount <= 0) {
        return;
      }

      onInsert({
        visitorId: payload.visitor_id || '',
        imageCount,
        sourcePage: payload.source_page || 'watermark',
      });
    })
    .subscribe((status) => onStatus?.(status));

  return () => {
    supabase.removeChannel(channel);
  };
}
