import { supabase, supabaseConfig } from '../lib/supabase.js';

const FUNCTION_NAME = 'suggest-image-names';
const REQUEST_TIMEOUT_MS = 150_000;

/** Overridable for a backend hosted elsewhere; the key itself never reaches the browser. */
export function getImageNameEndpoint() {
  const custom = import.meta.env?.VITE_IMAGE_NAME_API_URL;
  return custom || `${String(supabaseConfig.url || '').replace(/\/+$/, '')}/functions/v1/${FUNCTION_NAME}`;
}

/** Stable access codes shared with the Edge Function. */
export const AI_NAMING_ERRORS = Object.freeze({
  authRequired: 'AUTH_REQUIRED',
  accessDenied: 'AI_NAMING_ACCESS_DENIED',
  accessCheckFailed: 'ACCESS_CHECK_FAILED',
});

export const AI_NAMING_ACCESS_DENIED_MESSAGE = 'Đặt tên AI dành cho tài khoản Pro trở lên.';

const MESSAGES = {
  AUTH_REQUIRED: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để dùng Đặt tên AI.',
  AI_NAMING_ACCESS_DENIED: AI_NAMING_ACCESS_DENIED_MESSAGE,
  ACCESS_CHECK_FAILED: 'Không kiểm tra được quyền sử dụng. Vui lòng thử lại sau.',
  not_configured: 'Tính năng AI chưa được cấu hình trên máy chủ. Bạn vẫn có thể đổi tên thủ công.',
  not_deployed: 'Không tìm thấy dịch vụ AI trên máy chủ. Bạn vẫn có thể đổi tên thủ công.',
  network: 'Không kết nối được dịch vụ AI. Kiểm tra mạng rồi thử lại, hoặc đổi tên thủ công.',
  timeout: 'Máy chủ AI phản hồi quá lâu. Hãy thử lại các ảnh lỗi.',
  rate_limited: 'Bạn đã gửi quá nhiều yêu cầu.',
  too_many_concurrent: 'Đang có quá nhiều yêu cầu chạy cùng lúc. Hãy thử lại sau giây lát.',
  upstream_rate_limited: 'OpenAI đang giới hạn tần suất. Hãy thử lại sau ít phút.',
  upstream_timeout: 'AI phản hồi quá lâu. Hãy thử lại các ảnh lỗi.',
  upstream_quota: 'Dịch vụ AI tạm thời hết hạn mức. Vui lòng liên hệ quản trị viên.',
  upstream_auth: 'Máy chủ AI chưa được cấu hình đúng. Vui lòng liên hệ quản trị viên.',
  invalid_response: 'Máy chủ trả về dữ liệu không hợp lệ. Hãy thử lại.',
};

/** Errors that will fail again for every remaining batch, so the run stops. */
export const FATAL_IMAGE_NAME_ERRORS = new Set([
  'AUTH_REQUIRED', 'AI_NAMING_ACCESS_DENIED', 'ACCESS_CHECK_FAILED', 'not_configured', 'not_deployed', 'network',
  'rate_limited', 'upstream_quota', 'upstream_auth', 'upstream_rejected',
]);

export function describeImageNameError(code, serverMessage, retryAfterSeconds) {
  if (code === 'rate_limited' && retryAfterSeconds) {
    return `${MESSAGES.rate_limited} Thử lại sau khoảng ${Math.ceil(retryAfterSeconds / 60)} phút.`;
  }
  return MESSAGES[code] || serverMessage || 'Không tạo được tên gợi ý. Hãy thử lại.';
}

/**
 * @param {{ productName: string, prompt: string, images: Array<{ id: string, position: number, dataUrl: string }>, signal?: AbortSignal }} input
 * @returns {Promise<{ data: { items: unknown[], failed: unknown[] } | null, error: string | null, code: string | null }>}
 */
export async function requestImageNameSuggestions({ productName, prompt, images, signal }) {
  const fail = (code, serverMessage, retryAfterSeconds) => ({
    data: null, code, error: describeImageNameError(code, serverMessage, retryAfterSeconds),
  });

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return fail(AI_NAMING_ERRORS.authRequired);
  if (signal?.aborted) return { data: null, error: null, code: 'aborted' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(getImageNameEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseConfig.publishableKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productName, prompt, images }),
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      if (response.status === 404 && !body?.error?.code) return fail('not_deployed');
      const retryAfter = Number(body?.error?.retryAfterSeconds || response.headers.get('retry-after')) || undefined;
      // The Supabase gateway answers an invalid JWT with 401 and no `error.code`.
      const fallbackCode = { 401: AI_NAMING_ERRORS.authRequired, 403: AI_NAMING_ERRORS.accessDenied }[response.status] || 'server_error';
      return fail(body?.error?.code || fallbackCode, body?.error?.message, retryAfter);
    }
    if (!body || !Array.isArray(body.items) || !Array.isArray(body.failed)) return fail('invalid_response');
    return { data: { items: body.items, failed: body.failed }, error: null, code: null };
  } catch {
    if (signal?.aborted) return { data: null, error: null, code: 'aborted' };
    return fail(timedOut ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Same entitlement the Edge Function enforces (public.can_use_ai_naming), for
 * the UI only — the backend still decides on every request.
 * @returns {Promise<{ data: boolean | null, error: string | null }>}
 */
export async function fetchAiNamingAccess() {
  try {
    const { data, error } = await supabase.rpc('can_use_ai_naming');
    if (error || typeof data !== 'boolean') return { data: null, error: MESSAGES.ACCESS_CHECK_FAILED };
    return { data, error: null };
  } catch {
    return { data: null, error: MESSAGES.ACCESS_CHECK_FAILED };
  }
}
