import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

/**
 * @typedef {Object} DashboardActivity
 * @property {'upload' | 'watermark' | 'quotation' | 'product_link'} kind
 * @property {string} at
 */

/**
 * @typedef {Object} DashboardSummary
 * @property {boolean} [has_password]
 * @property {string | null} [last_login_at]
 * @property {number} [uploads_total]
 * @property {number} [watermark_images]
 * @property {number} [watermark_images_7d]
 * @property {number} [quotations]
 * @property {string | null} [quotations_last_at]
 * @property {number} [product_links_level] 0 none … 3 editor
 * @property {number} [product_links_done]
 * @property {DashboardActivity[]} recent
 */

/**
 * Counts and recent activity of the signed-in user (supabase_my_dashboard.sql).
 * Keys of modules that are not installed are simply absent.
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<DashboardSummary>>}
 */
export async function getMyDashboardSummary() {
  try {
    const { data, error } = await supabase.rpc('my_dashboard_summary');

    if (error) {
      console.error('[dashboardService] getMyDashboardSummary failed', error);
      const message = error.code === 'PGRST202'
        ? 'Chưa tạo RPC tổng quan trên Supabase. Hãy chạy supabase_my_dashboard.sql.'
        : normalizeServiceError(error, 'Không thể tải tổng quan tài khoản.');
      return createServiceResult(null, message);
    }

    return createServiceResult({ ...data, recent: data?.recent ?? [] });
  } catch (error) {
    console.error('[dashboardService] getMyDashboardSummary exception', error);
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải tổng quan tài khoản.'));
  }
}
