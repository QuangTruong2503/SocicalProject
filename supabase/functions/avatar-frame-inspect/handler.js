/**
 * POST /functions/v1/avatar-frame-inspect   (admins only)
 *
 * Body: { path }  — a file the admin just uploaded to the avatar-frames bucket.
 * 200:  { path, info: { format, frame_type, width, height, file_size, frame_count, duration_ms } }
 * Err:  { error: { code, message } } — 401 AUTH_REQUIRED, 403 FORBIDDEN, 400 invalid_request,
 *       404 not_found, 422 invalid_file (the file is deleted), 503 not_configured / check_failed
 *
 * The function reads the stored bytes itself (the admin's own token, through the
 * bucket's admin read policy), checks them with frameImage.js and records the
 * result with the service role via avatar_frame_record_upload(). Saving a frame
 * only accepts recorded files, so metadata never comes from the browser.
 *
 * Runtime-agnostic (Deno in production, Node in tests): env and fetch are injected.
 * The key helpers are copied from suggest-image-names because a function may only
 * import files inside its own folder.
 */
import { AVATAR_FRAME_LIMITS, AVATAR_FRAME_STORAGE_PATH, validateFrameBytes } from './frameImage.js';

const BUCKET = 'avatar-frames';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES = {
  method_not_allowed: 'Chỉ hỗ trợ phương thức POST.',
  AUTH_REQUIRED: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
  FORBIDDEN: 'Chỉ quản trị viên mới được tải khung avatar.',
  invalid_request: 'Đường dẫn file không hợp lệ.',
  not_found: 'Không tìm thấy file vừa tải lên. Hãy tải lại.',
  not_configured: 'Máy chủ chưa được cấu hình để kiểm tra khung avatar.',
  check_failed: 'Không kiểm tra được file trên máy chủ. Vui lòng thử lại.',
  internal_error: 'Máy chủ gặp lỗi không mong muốn.',
};

class RequestError extends Error {
  constructor(code, status, message) {
    super(code);
    this.code = code;
    this.status = status;
    this.publicMessage = message || MESSAGES[code] || MESSAGES.internal_error;
  }
}

export function resolvePublicApiKey(getEnv) {
  const single = getEnv('SUPABASE_PUBLISHABLE_KEY') || getEnv('SUPABASE_ANON_KEY');
  if (single) return single;
  const many = getEnv('SUPABASE_PUBLISHABLE_KEYS');
  if (!many) return '';
  try {
    const parsed = JSON.parse(many);
    const values = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
    return values.find((value) => typeof value === 'string' && value) || '';
  } catch {
    return many.split(',')[0].trim();
  }
}

export function resolveServiceCredentials(getEnv) {
  let key = '';
  const many = getEnv('SUPABASE_SECRET_KEYS');
  if (many) {
    try {
      const parsed = JSON.parse(many);
      const values = Array.isArray(parsed) ? parsed : [parsed?.default, ...Object.values(parsed || {})];
      key = values.find((value) => typeof value === 'string' && value) || '';
    } catch {
      key = many.split(',')[0].trim();
    }
  }
  key ||= getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!key) return null;
  return key.startsWith('sb_secret_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

function corsHeaders(request, allowedOrigins) {
  const origin = request.headers.get('origin');
  const allowOrigin = !allowedOrigins.length ? '*' : (origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * @param {{ getEnv: (name: string) => string | undefined, fetchImpl?: typeof fetch, logger?: Pick<Console, 'warn' | 'error'> }} deps
 */
export function createAvatarFrameInspectHandler({ getEnv, fetchImpl = fetch, logger = console }) {
  const allowedOrigins = String(getEnv('ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean);

  async function call(url, init, step) {
    try {
      return await fetchImpl(url, init);
    } catch {
      logger.warn('[avatar-frame-inspect] request failed', { step });
      throw new RequestError('check_failed', 503);
    }
  }

  async function inspect(request) {
    const supabaseUrl = String(getEnv('SUPABASE_URL') || '').replace(/\/+$/, '');
    const apiKey = resolvePublicApiKey(getEnv) || request.headers.get('apikey') || '';
    const service = resolveServiceCredentials(getEnv);
    if (!supabaseUrl || !apiKey || !service) throw new RequestError('not_configured', 503);

    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new RequestError('AUTH_REQUIRED', 401);

    let body;
    try {
      body = await request.json();
    } catch {
      throw new RequestError('invalid_request', 400);
    }
    const path = typeof body?.path === 'string' ? body.path : '';
    if (!AVATAR_FRAME_STORAGE_PATH.test(path)) throw new RequestError('invalid_request', 400);

    const userHeaders = { apikey: apiKey, Authorization: `Bearer ${token}` };

    const userResponse = await call(`${supabaseUrl}/auth/v1/user`, { headers: userHeaders }, 'user');
    if (userResponse.status === 401 || userResponse.status === 403) throw new RequestError('AUTH_REQUIRED', 401);
    if (!userResponse.ok) throw new RequestError('check_failed', 503);
    const user = await userResponse.json().catch(() => null);
    if (typeof user?.id !== 'string' || !UUID_PATTERN.test(user.id)) throw new RequestError('AUTH_REQUIRED', 401);

    // The database decides who is an admin (profiles.role, suspended admins excluded).
    const adminResponse = await call(`${supabaseUrl}/rest/v1/rpc/avatar_frames_require_admin`, {
      method: 'POST',
      headers: { ...userHeaders, 'Content-Type': 'application/json' },
      body: '{}',
    }, 'admin');
    if (!adminResponse.ok) {
      if (adminResponse.status >= 400 && adminResponse.status < 500) throw new RequestError('FORBIDDEN', 403);
      throw new RequestError('check_failed', 503);
    }

    const fileResponse = await call(`${supabaseUrl}/storage/v1/object/authenticated/${BUCKET}/${path}`, { headers: userHeaders }, 'download');
    if (fileResponse.status === 404 || fileResponse.status === 400) throw new RequestError('not_found', 404);
    if (!fileResponse.ok) throw new RequestError('check_failed', 503);
    const declared = Number(fileResponse.headers.get('content-length'));
    const bytes = Number.isFinite(declared) && declared > AVATAR_FRAME_LIMITS.maxBytes
      ? new Uint8Array(AVATAR_FRAME_LIMITS.maxBytes + 1)
      : new Uint8Array(await fileResponse.arrayBuffer());

    const result = bytes.length > AVATAR_FRAME_LIMITS.maxBytes
      ? { error: `Dung lượng cần từ 1 byte đến ${AVATAR_FRAME_LIMITS.maxBytes / 1024 / 1024} MB.` }
      : validateFrameBytes(bytes);

    if (result.error) {
      // The bucket policy only lets this remove a file no frame uses.
      await call(`${supabaseUrl}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        headers: { ...userHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }),
      }, 'cleanup').catch(() => null);
      throw new RequestError('invalid_file', 422, result.error);
    }

    const info = {
      format: result.info.format,
      frame_type: result.info.type,
      width: result.info.width,
      height: result.info.height,
      file_size: result.info.fileSize,
      frame_count: result.info.frameCount,
      duration_ms: result.info.durationMs,
    };

    const recordResponse = await call(`${supabaseUrl}/rest/v1/rpc/avatar_frame_record_upload`, {
      method: 'POST',
      headers: { ...service, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ p_path: path, p_info: info, p_inspected_by: user.id }),
    }, 'record');
    if (!recordResponse.ok) {
      logger.error('[avatar-frame-inspect] record failed', { status: recordResponse.status });
      throw new RequestError('check_failed', 503);
    }

    return { path, info };
  }

  return async function handler(request) {
    const cors = corsHeaders(request, allowedOrigins);
    if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (request.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: MESSAGES.method_not_allowed } }, 405, cors);

    try {
      return json(await inspect(request), 200, cors);
    } catch (error) {
      if (error instanceof RequestError) {
        return json({ error: { code: error.code, message: error.publicMessage } }, error.status, cors);
      }
      logger.error('[avatar-frame-inspect] unexpected error', error);
      return json({ error: { code: 'internal_error', message: MESSAGES.internal_error } }, 500, cors);
    }
  };
}
