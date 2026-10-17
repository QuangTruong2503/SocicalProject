/**
 * POST /functions/v1/suggest-image-names
 *
 * Body: { productName, prompt?, images: [{ id, position, dataUrl }] }  (≤ 6 images)
 * 200:  { items: [{ imageId, suggestedName, needsReview }], failed: [{ imageId, code }], model }
 * Err:  { error: { code, message, retryAfterSeconds? } } — access: 401 AUTH_REQUIRED,
 *       403 AI_NAMING_ACCESS_DENIED, 503 ACCESS_CHECK_FAILED (could not decide; retry)
 *
 * Runtime-agnostic (Deno in production, Node in tests): every outside
 * dependency — env, fetch, clock, sleep — is injected.
 */
import {
  DEFAULT_IMAGE_NAME_PROMPT,
  IMAGE_ID_PATTERN,
  IMAGE_NAME_LIMITS,
  composeSuggestedName,
  matchItemsById,
  renderPromptTemplate,
  slugifyFileName,
} from './imageNaming.js';
import {
  DEFAULT_IMAGE_NAME_MODEL,
  DEFAULT_REASONING_EFFORT,
  UpstreamError,
  buildOpenAIRequest,
  callOpenAI,
  parseOpenAIOutput,
} from './openai.js';

const DATA_URL_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
// Empty / unknown → the `reasoning` field is omitted and the model default applies.
const REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

export const RATE_LIMITS = Object.freeze({
  windowMs: 10 * 60 * 1000,
  maxRequestsPerWindow: 40,
  maxImagesPerWindow: 150,
  maxConcurrentPerUser: 2,
  maxConcurrentTotal: 8,
});

const ERROR_MESSAGES = {
  method_not_allowed: 'Chỉ hỗ trợ phương thức POST.',
  AUTH_REQUIRED: 'Bạn cần đăng nhập để dùng Đặt tên AI.',
  AI_NAMING_ACCESS_DENIED: 'Đặt tên AI dành cho tài khoản Pro trở lên.',
  ACCESS_CHECK_FAILED: 'Không kiểm tra được quyền sử dụng. Vui lòng thử lại sau.',
  not_configured: 'Tính năng đặt tên bằng AI chưa được cấu hình trên máy chủ.',
  payload_too_large: 'Dữ liệu ảnh gửi lên quá lớn.',
  invalid_request: 'Dữ liệu gửi lên không hợp lệ.',
  rate_limited: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.',
  too_many_concurrent: 'Đang có quá nhiều yêu cầu chạy cùng lúc. Vui lòng thử lại sau giây lát.',
  upstream_quota: 'Dịch vụ AI tạm thời hết hạn mức sử dụng. Vui lòng liên hệ quản trị viên.',
  upstream_auth: 'Máy chủ AI từ chối xác thực. Vui lòng liên hệ quản trị viên.',
  upstream_rate_limited: 'OpenAI đang giới hạn tần suất. Vui lòng thử lại sau ít phút.',
  upstream_timeout: 'AI phản hồi quá lâu. Vui lòng thử lại.',
  upstream_unreachable: 'Không kết nối được tới OpenAI. Vui lòng thử lại.',
  upstream_rejected: 'OpenAI từ chối yêu cầu (kiểm tra cấu hình model).',
  upstream_error: 'Dịch vụ AI đang gặp sự cố. Vui lòng thử lại.',
  internal_error: 'Máy chủ gặp lỗi không mong muốn.',
};

const UPSTREAM_STATUS = {
  upstream_quota: 503,
  upstream_auth: 502,
  upstream_rate_limited: 429,
  upstream_timeout: 504,
  upstream_unreachable: 502,
  upstream_rejected: 502,
  upstream_error: 502,
};

// Output-level problems: the request reached the model, so the batch is
// answered with 200 and every image is reported as failed (retryable).
const OUTPUT_ERROR_CODES = new Set(['upstream_incomplete', 'upstream_refused', 'upstream_invalid_output']);

class RequestError extends Error {
  constructor(code, status, message, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.publicMessage = message || ERROR_MESSAGES[code] || ERROR_MESSAGES.internal_error;
    this.extra = extra;
  }
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

/** First publishable/anon key from the env names Supabase provisions (JSON map, list or plain string). */
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

/** In-memory, per-isolate limiter. Best effort: isolates do not share state. */
export function createRateLimiter(now, limits = RATE_LIMITS) {
  const history = new Map();
  const inFlight = new Map();
  let totalInFlight = 0;

  return {
    acquire(userId, imageCount) {
      const current = now();
      const recent = (history.get(userId) || []).filter((entry) => current - entry.at < limits.windowMs);
      const usedImages = recent.reduce((sum, entry) => sum + entry.images, 0);

      if (recent.length >= limits.maxRequestsPerWindow || usedImages + imageCount > limits.maxImagesPerWindow) {
        history.set(userId, recent);
        const retryAfterSeconds = recent.length ? Math.max(1, Math.ceil((recent[0].at + limits.windowMs - current) / 1000)) : 60;
        throw new RequestError('rate_limited', 429, undefined, { retryAfterSeconds });
      }
      if ((inFlight.get(userId) || 0) >= limits.maxConcurrentPerUser || totalInFlight >= limits.maxConcurrentTotal) {
        throw new RequestError('too_many_concurrent', 429, undefined, { retryAfterSeconds: 5 });
      }

      recent.push({ at: current, images: imageCount });
      history.set(userId, recent);
      inFlight.set(userId, (inFlight.get(userId) || 0) + 1);
      totalInFlight += 1;

      let released = false;
      return () => {
        if (released) return;
        released = true;
        totalInFlight -= 1;
        const left = (inFlight.get(userId) || 1) - 1;
        if (left > 0) inFlight.set(userId, left);
        else inFlight.delete(userId);
      };
    },
  };
}

/**
 * Verifies the session and the "Đặt tên AI" entitlement on every request,
 * before the body (images) is read or OpenAI is called. Identity comes from
 * the JWT only (Supabase Auth); the decision from public.can_use_ai_naming(),
 * evaluated by Postgres for auth.uid() of that same JWT — nothing in the
 * request body is trusted. No caching: a downgrade applies to the next request.
 * Any failure to decide denies access (ACCESS_CHECK_FAILED, retryable).
 */
async function authorizeAiNaming(request, { getEnv, fetchImpl, logger }) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  if (!token) throw new RequestError('AUTH_REQUIRED', 401);

  const supabaseUrl = (getEnv('SUPABASE_URL') || '').replace(/\/+$/, '');
  const apiKey = resolvePublicApiKey(getEnv) || request.headers.get('apikey') || '';
  if (!supabaseUrl || !apiKey) throw new RequestError('ACCESS_CHECK_FAILED', 503);
  const headers = { apikey: apiKey, Authorization: `Bearer ${token}` };
  const checkFailed = (step, status) => {
    logger.warn('[suggest-image-names] access check failed', { step, status });
    return new RequestError('ACCESS_CHECK_FAILED', 503);
  };

  let user;
  try {
    const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers });
    if (response.status === 401 || response.status === 403) throw new RequestError('AUTH_REQUIRED', 401);
    if (!response.ok) throw checkFailed('user', response.status);
    user = await response.json();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw checkFailed('user', 0);
  }
  if (!user?.id) throw new RequestError('AUTH_REQUIRED', 401);

  let allowed;
  try {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/can_use_ai_naming`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (response.status === 401) throw new RequestError('AUTH_REQUIRED', 401);
    // 404 here usually means migration 20261017100000_ai_naming_access.sql is not applied.
    if (!response.ok) throw checkFailed('entitlement', response.status);
    allowed = await response.json();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw checkFailed('entitlement', 0);
  }
  if (allowed === false) throw new RequestError('AI_NAMING_ACCESS_DENIED', 403);
  if (allowed !== true) throw checkFailed('entitlement', 200);

  return user.id;
}

function stripControlChars(value, replacement, keep = '') {
  let output = '';
  for (const char of value) {
    const code = char.codePointAt(0);
    output += (code < 32 || code === 127) && !keep.includes(char) ? replacement : char;
  }
  return output;
}

/** Validates and normalizes the request body; throws RequestError(400) with a specific message. */
export function validatePayload(body) {
  const invalid = (message) => new RequestError('invalid_request', 400, message);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();

  const productName = typeof body.productName === 'string'
    ? stripControlChars(body.productName, ' ').replace(/\s+/g, ' ').trim()
    : '';
  if (!productName) throw invalid('Vui lòng nhập tên sản phẩm.');
  if (productName.length > IMAGE_NAME_LIMITS.maxProductNameLength) {
    throw invalid(`Tên sản phẩm tối đa ${IMAGE_NAME_LIMITS.maxProductNameLength} ký tự.`);
  }
  if (!slugifyFileName(productName)) throw invalid('Tên sản phẩm cần có ít nhất một chữ cái hoặc chữ số.');

  if (body.prompt != null && typeof body.prompt !== 'string') throw invalid();
  // Prompts keep line breaks and tabs; other control characters are dropped.
  const prompt = stripControlChars(body.prompt || '', '', '\n\r\t').trim() || DEFAULT_IMAGE_NAME_PROMPT;
  if (prompt.length > IMAGE_NAME_LIMITS.maxPromptLength) {
    throw invalid(`Prompt tối đa ${IMAGE_NAME_LIMITS.maxPromptLength} ký tự.`);
  }

  if (!Array.isArray(body.images) || body.images.length === 0) throw invalid('Chưa có ảnh nào để phân tích.');
  if (body.images.length > IMAGE_NAME_LIMITS.maxImagesPerRequest) {
    throw invalid(`Mỗi yêu cầu tối đa ${IMAGE_NAME_LIMITS.maxImagesPerRequest} ảnh.`);
  }

  const seen = new Set();
  const images = body.images.map((image) => {
    if (!image || typeof image !== 'object') throw invalid();
    const { id, position, dataUrl } = image;
    if (typeof id !== 'string' || !IMAGE_ID_PATTERN.test(id) || seen.has(id)) throw invalid('ID ảnh không hợp lệ hoặc bị trùng.');
    seen.add(id);
    if (!Number.isInteger(position) || position < 1 || position > IMAGE_NAME_LIMITS.maxPosition) throw invalid('Số thứ tự ảnh không hợp lệ.');
    if (typeof dataUrl !== 'string' || dataUrl.length > IMAGE_NAME_LIMITS.maxImageDataUrlLength) {
      throw new RequestError('payload_too_large', 413, 'Ảnh gửi lên quá lớn. Hãy thử lại.');
    }
    if (!DATA_URL_PATTERN.test(dataUrl)) throw invalid('Dữ liệu ảnh phải là JPEG, PNG hoặc WebP dạng base64.');
    return { id, position, dataUrl };
  });

  return { productName, prompt, images };
}

/**
 * @param {{
 *   getEnv: (name: string) => string | undefined,
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   random?: () => number,
 *   logger?: Pick<Console, 'warn' | 'error'>,
 *   openAITimeoutMs?: number,
 * }} deps
 */
export function createSuggestImageNamesHandler({
  getEnv,
  fetchImpl = (...args) => fetch(...args),
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  logger = console,
  openAITimeoutMs,
}) {
  const limiter = createRateLimiter(now);

  return async function handleSuggestImageNames(request) {
    const allowedOrigins = (getEnv('IMAGE_NAME_ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean);
    const cors = corsHeaders(request, allowedOrigins);
    if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });

    let release = null;
    try {
      if (request.method !== 'POST') throw new RequestError('method_not_allowed', 405);

      const declaredLength = Number(request.headers.get('content-length'));
      if (declaredLength > IMAGE_NAME_LIMITS.maxBodyLength) throw new RequestError('payload_too_large', 413);

      // Entitlement before reading the images: denied callers never upload data or reach OpenAI.
      const userId = await authorizeAiNaming(request, { getEnv, fetchImpl, logger });

      const raw = await request.text();
      if (raw.length > IMAGE_NAME_LIMITS.maxBodyLength) throw new RequestError('payload_too_large', 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new RequestError('invalid_request', 400);
      }
      const payload = validatePayload(body);

      const apiKey = getEnv('OPENAI_IMAGE_NAME_KEY');
      if (!apiKey) throw new RequestError('not_configured', 503);

      release = limiter.acquire(userId, payload.images.length);

      const model = getEnv('OPENAI_IMAGE_NAME_MODEL') || DEFAULT_IMAGE_NAME_MODEL;
      const configuredEffort = (getEnv('OPENAI_IMAGE_NAME_REASONING_EFFORT') ?? DEFAULT_REASONING_EFFORT).trim().toLowerCase();
      const reasoningEffort = REASONING_EFFORTS.has(configuredEffort) ? configuredEffort : '';
      const requestedIds = payload.images.map((image) => image.id);

      let modelItems;
      try {
        const data = await callOpenAI(
          buildOpenAIRequest({
            model,
            reasoningEffort,
            productName: payload.productName,
            userPrompt: renderPromptTemplate(payload.prompt, payload.productName),
            images: payload.images,
          }),
          { apiKey, fetchImpl, sleep, random, logger, ...(openAITimeoutMs ? { timeoutMs: openAITimeoutMs } : {}) },
        );
        modelItems = parseOpenAIOutput(data);
      } catch (error) {
        if (error instanceof UpstreamError && OUTPUT_ERROR_CODES.has(error.code)) {
          logger.warn('[suggest-image-names] unusable model output', { code: error.code });
          return json({ items: [], failed: requestedIds.map((imageId) => ({ imageId, code: error.code })), model }, 200, cors);
        }
        if (error instanceof UpstreamError) {
          throw new RequestError(error.code, UPSTREAM_STATUS[error.code] || 502, undefined,
            error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {});
        }
        throw error;
      }

      const { matched, missingIds, unknownCount, duplicateCount } = matchItemsById(requestedIds, modelItems);
      if (unknownCount || duplicateCount || missingIds.length) {
        logger.warn('[suggest-image-names] model output mismatch', { unknownCount, duplicateCount, missing: missingIds.length });
      }

      const positions = new Map(payload.images.map((image) => [image.id, image.position]));
      const items = [];
      const failed = missingIds.map((imageId) => ({ imageId, code: 'missing' }));
      for (const [imageId, item] of matched) {
        const descriptor = typeof item.descriptor === 'string' ? item.descriptor.slice(0, 200) : '';
        items.push({
          imageId,
          ...composeSuggestedName({
            productName: payload.productName,
            descriptor,
            position: positions.get(imageId),
            needsReview: item.needsReview === true,
          }),
        });
      }

      return json({ items, failed, model }, 200, cors);
    } catch (error) {
      if (error instanceof RequestError) {
        const headers = error.extra.retryAfterSeconds ? { ...cors, 'Retry-After': String(error.extra.retryAfterSeconds) } : cors;
        return json({ error: { code: error.code, message: error.publicMessage, ...error.extra } }, error.status, headers);
      }
      logger.error('[suggest-image-names] unexpected error', { name: error?.name });
      return json({ error: { code: 'internal_error', message: ERROR_MESSAGES.internal_error } }, 500, cors);
    } finally {
      release?.();
    }
  };
}
