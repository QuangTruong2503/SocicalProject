import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

const WATERMARK_IMAGE_COUNTS_TABLE = 'watermark_image_counts';
const PAGE_SIZE = 1000;

/**
 * Pages through `watermark_image_counts` so results aren't silently capped
 * by PostgREST's default "Max Rows" setting (1000).
 *
 * @param {{ columns: string, sourcePage?: string | null, visitorId?: string | null }} options
 */
async function fetchAllWatermarkRows({ columns, sourcePage = null, visitorId = null }) {
  const rows = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .from(WATERMARK_IMAGE_COUNTS_TABLE)
      .select(columns)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (sourcePage) {
      query = query.eq('source_page', sourcePage);
    }

    if (visitorId) {
      query = query.eq('visitor_id', visitorId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    rows.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
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
    const rows = await fetchAllWatermarkRows({
      columns: 'visitor_id, user_id, display_name, source_page, image_count, created_at',
      sourcePage,
    });

    return createServiceResult(rows);
  } catch (error) {
    console.error('[watermarkImageCountService] getWatermarkDashboardRows exception', { error, sourcePage });
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải dữ liệu dashboard watermark.'));
  }
}

/**
 * Fetch grouped watermark stats by visitor_id for the dashboard, aggregated
 * client-side directly from `watermark_image_counts` (no DB view required).
 *
 * @param {{ sourcePage?: string | null }} options
 */
export async function getWatermarkVisitorStatsRows({ sourcePage = null } = {}) {
  try {
    const rows = await fetchAllWatermarkRows({
      columns: 'visitor_id, user_id, display_name, source_page, image_count, created_at',
    });

    const grouped = new Map();

    for (const row of rows) {
      if (!row.visitor_id) {
        continue;
      }

      const entry = grouped.get(row.visitor_id) || {
        visitor_id: row.visitor_id,
        user_id: null,
        display_name: null,
        total_images: 0,
        entry_count: 0,
        source_pages: new Set(),
        last_seen_at: null,
      };

      entry.total_images += Number(row.image_count) || 0;
      entry.entry_count += 1;
      entry.source_pages.add(row.source_page || 'watermark');

      if (!entry.user_id && row.user_id) {
        entry.user_id = row.user_id;
      }

      // Rows are ordered by created_at desc, so the first non-empty
      // display_name encountered for a visitor is already the most recent one.
      if (!entry.display_name && row.display_name && row.display_name.trim()) {
        entry.display_name = row.display_name.trim();
      }

      if (!entry.last_seen_at || new Date(row.created_at) > new Date(entry.last_seen_at)) {
        entry.last_seen_at = row.created_at;
      }

      grouped.set(row.visitor_id, entry);
    }

    const statsRows = Array.from(grouped.values()).map((entry) => ({
      ...entry,
      source_pages: Array.from(entry.source_pages),
    }));

    const filteredRows = statsRows.filter((row) => (
      !sourcePage || sourcePage === 'all' || row.source_pages.includes(sourcePage)
    ));

    return createServiceResult(filteredRows);
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
    const rows = await fetchAllWatermarkRows({
      columns: 'image_count',
      sourcePage,
      visitorId,
    });

    const total = rows.reduce((sum, row) => sum + (Number(row.image_count) || 0), 0);

    return createServiceResult(total);
  } catch (error) {
    console.error('[watermarkImageCountService] getWatermarkImageCountTotal exception', { error, sourcePage, visitorId });
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải số lượng ảnh watermark.'));
  }
}
