/**
 * POST /functions/v1/suggest-image-names
 *
 * Body: { productName, prompt?, images: [{ id, position, dataUrl }], requestId?, aiRunId? }  (≤ 6 images)
 *       requestId: UUID of this batch operation; a resend after a network error
 *       reuses it and never triggers a second provider call. aiRunId groups the
 *       batches of one click. Both optional (older clients).
 * 200:  { items: [{ imageId, suggestedName, needsReview }], failed: [{ imageId, code }], model, requestId }
 * Err:  { error: { code, message, retryAfterSeconds? }, requestId? } — access: 401 AUTH_REQUIRED,
 *       403 AI_NAMING_ACCESS_DENIED, 503 ACCESS_CHECK_FAILED (could not decide; retry)
 *
 * Every accepted batch is recorded in the usage ledger (supabase/migrations/
 * 20261018090000_usage_ledger.sql) before OpenAI is called; if that record
 * cannot be written, OpenAI is not called (503 usage_tracking_unavailable).
 * Limits and quotas are decided there, atomically across instances.
 *
 * Runtime-agnostic (Deno in production, Node in tests): every outside
 * dependency — env, fetch, clock, sleep, ledger — is injected.
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
import {
  attemptRecord,
  computeFingerprint,
  createPostgrestLedger,
  resolveEnvironment,
  resolveKeyAlias,
  resolveServiceCredentials,
  writeWithRetry,
} from './usageLedger.js';

const DATA_URL_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Empty / unknown → the `reasoning` field is omitted and the model default applies.
const REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

const ERROR_MESSAGES = {
  method_not_allowed: 'Chỉ hỗ trợ phương thức POST.',
  AUTH_REQUIRED: 'Bạn cần đăng nhập để dùng Đặt tên AI.',
  AI_NAMING_ACCESS_DENIED: 'Đặt tên AI dành cho tài khoản Pro trở lên.',
  ACCESS_CHECK_FAILED: 'Không kiểm tra được quyền sử dụng. Vui lòng thử lại sau.',
  not_configured: 'Tính năng đặt tên bằng AI chưa được cấu hình trên máy chủ.',
  usage_tracking_unavailable: 'Chưa ghi nhận được lượt sử dụng nên yêu cầu chưa được gửi tới AI. Vui lòng thử lại sau.',
  AI_USAGE_PAUSED: 'Quản trị viên đang tạm dừng Đặt tên ảnh bằng AI. Bạn vẫn có thể đổi tên thủ công.',
  AI_QUOTA_EXCEEDED: 'Bạn đã dùng hết hạn mức ảnh đặt tên bằng AI.',
  IDEMPOTENCY_CONFLICT: 'Mã yêu cầu đã được dùng cho dữ liệu khác. Hãy thử lại.',
  REQUEST_IN_PROGRESS: 'Yêu cầu này vẫn đang được xử lý. Vui lòng đợi rồi thử lại.',
  REQUEST_ALREADY_PROCESSED: 'Yêu cầu này đã được xử lý trước đó. Hãy bấm thử lại để tạo yêu cầu mới.',
  REQUEST_OUTCOME_UNKNOWN: 'Không xác định được kết quả của yêu cầu trước (AI có thể đã xử lý). Hãy bấm thử lại để tạo yêu cầu mới.',
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

// Refusals after the JWT was verified, recorded in the ledger (no attempt rows).
// Limits/quota/pause refusals are recorded by ai_usage_begin itself.
const RECORDED_REJECTIONS = new Set(['AI_NAMING_ACCESS_DENIED', 'invalid_request', 'payload_too_large', 'not_configured']);

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

function errorResponse(error, cors, requestId) {
  const headers = error.extra.retryAfterSeconds ? { ...cors, 'Retry-After': String(error.extra.retryAfterSeconds) } : cors;
  return json({
    error: { code: error.code, message: error.publicMessage, ...error.extra },
    ...(requestId ? { requestId } : {}),
  }, error.status, headers);
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

/**
 * Verifies the session and the "Đặt tên AI" entitlement on every request,
 * before the body (images) is read or OpenAI is called. Identity comes from
 * the JWT only (Supabase Auth); the decision from public.can_use_ai_naming(),
 * evaluated by Postgres for auth.uid() of that same JWT — nothing in the
 * request body is trusted. No caching: a downgrade applies to the next request.
 * Any failure to decide denies access (ACCESS_CHECK_FAILED, retryable).
 * A refusal carries `verifiedUserId` so it can be recorded for that user.
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
  if (typeof user?.id !== 'string' || !UUID_PATTERN.test(user.id)) throw new RequestError('AUTH_REQUIRED', 401);

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
  if (allowed === false) {
    const denied = new RequestError('AI_NAMING_ACCESS_DENIED', 403);
    denied.verifiedUserId = user.id;
    throw denied;
  }
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

  const optionalUuid = (value) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw invalid('Mã yêu cầu không hợp lệ.');
    return value.toLowerCase();
  };
  const requestId = optionalUuid(body.requestId);
  const aiRunId = optionalUuid(body.aiRunId);

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

  return { productName, prompt, images, requestId, aiRunId };
}

/** A refusal decided by ai_usage_begin (already recorded there). */
function ledgerRefusal(decision) {
  const extra = {};
  if (decision.retry_after_seconds) extra.retryAfterSeconds = decision.retry_after_seconds;
  let message;
  if (decision.code === 'AI_QUOTA_EXCEEDED' && decision.quota) {
    const scope = decision.quota.scope === 'monthly' ? 'tháng' : 'ngày';
    extra.quota = { scope: decision.quota.scope, limit: decision.quota.limit, used: decision.quota.used };
    message = `Bạn đã dùng hết hạn mức ${decision.quota.limit} ảnh đặt tên bằng AI trong ${scope} này.`;
  }
  return new RequestError(decision.code, decision.http_status || 409, message, extra);
}

/** Answer stored for an earlier identical request — no new provider call. */
function replayResponse(replay, cors, requestId) {
  const body = replay?.body;
  if (body?.error?.code) {
    const error = new RequestError(body.error.code, replay.http_status || 502, undefined,
      body.error.retryAfterSeconds ? { retryAfterSeconds: body.error.retryAfterSeconds } : {});
    return errorResponse(error, cors, requestId);
  }
  return json({ items: body?.items || [], failed: body?.failed || [], model: body?.model, requestId, replayed: true }, 200, cors);
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
 *   ledger?: { begin: Function, attemptStart: Function, attemptFinish: Function, finish: Function, recordRejection: Function },
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
  ledger: injectedLedger = null,
}) {
  let aliasWarned = false;
  const getLedger = () => {
    if (injectedLedger) return injectedLedger;
    const supabaseUrl = (getEnv('SUPABASE_URL') || '').replace(/\/+$/, '');
    const credentials = resolveServiceCredentials(getEnv);
    return supabaseUrl && credentials ? createPostgrestLedger({ supabaseUrl, credentials, fetchImpl }) : null;
  };
  const logWriteFailure = (step, requestId, attempt) => {
    logger.error('[suggest-image-names] usage ledger write failed', { step, requestId, ...(attempt ? { attempt } : {}) });
  };

  return async function handleSuggestImageNames(request) {
    const allowedOrigins = (getEnv('IMAGE_NAME_ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean);
    const cors = corsHeaders(request, allowedOrigins);
    if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });

    let ledger = null;
    // Ledger context, filled once the JWT subject is known. Nothing in it comes
    // from the body except validated IDs and the image count.
    let context = null;

    try {
      if (request.method !== 'POST') throw new RequestError('method_not_allowed', 405);

      const declaredLength = Number(request.headers.get('content-length'));
      if (declaredLength > IMAGE_NAME_LIMITS.maxBodyLength) throw new RequestError('payload_too_large', 413);

      const model = getEnv('OPENAI_IMAGE_NAME_MODEL') || DEFAULT_IMAGE_NAME_MODEL;
      const keyAlias = resolveKeyAlias(getEnv);
      if (!keyAlias.valid && !aliasWarned) {
        aliasWarned = true;
        logger.warn('[suggest-image-names] OPENAI_IMAGE_NAME_KEY_ALIAS ignored: it must be a plain label, not a key');
      }
      const baseContext = (userId) => ({
        user_id: userId,
        feature: 'ai_image_naming',
        provider: 'openai',
        endpoint: 'responses',
        environment: resolveEnvironment(getEnv),
        key_alias: keyAlias.alias,
        requested_model: model,
      });

      ledger = getLedger();

      // Entitlement before reading the images: denied callers never upload data or reach OpenAI.
      let userId;
      try {
        userId = await authorizeAiNaming(request, { getEnv, fetchImpl, logger });
      } catch (error) {
        if (error.verifiedUserId) context = baseContext(error.verifiedUserId);
        throw error;
      }
      context = baseContext(userId);

      const raw = await request.text();
      if (raw.length > IMAGE_NAME_LIMITS.maxBodyLength) throw new RequestError('payload_too_large', 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new RequestError('invalid_request', 400);
      }
      const payload = validatePayload(body);
      context = {
        ...context,
        client_request_id: payload.requestId,
        ai_run_id: payload.aiRunId,
        images_requested: payload.images.length,
      };

      const apiKey = getEnv('OPENAI_IMAGE_NAME_KEY');
      if (!apiKey) throw new RequestError('not_configured', 503);

      // The start record must exist before the paid call; without it, no call.
      if (!ledger) {
        logger.error('[suggest-image-names] usage ledger not configured (SUPABASE_URL / server key missing)');
        throw new RequestError('usage_tracking_unavailable', 503);
      }
      let decision;
      try {
        const fingerprint = payload.requestId ? await computeFingerprint(getEnv, payload) : null;
        decision = await ledger.begin({ ...context, fingerprint });
      } catch {
        logger.error('[suggest-image-names] usage ledger unavailable', { step: 'begin' });
        context = null; // nothing to record: the ledger is the thing that failed
        throw new RequestError('usage_tracking_unavailable', 503);
      }
      if (decision?.decision === 'replay') return replayResponse(decision.replay, cors, decision.request_id);
      if (decision?.decision !== 'accepted' || typeof decision.request_id !== 'string') {
        context = null; // already recorded by ai_usage_begin
        if (!decision?.code) throw new RequestError('usage_tracking_unavailable', 503);
        const refusal = ledgerRefusal(decision);
        return errorResponse(refusal, cors, decision.request_id);
      }

      const requestId = decision.request_id;
      const configuredEffort = (getEnv('OPENAI_IMAGE_NAME_REASONING_EFFORT') ?? DEFAULT_REASONING_EFFORT).trim().toLowerCase();
      const reasoningEffort = REASONING_EFFORTS.has(configuredEffort) ? configuredEffort : '';
      const requestedIds = payload.images.map((image) => image.id);

      // Each attempt is recorded as it happens; a failed write is logged and
      // never causes another provider call.
      const onAttemptStart = async (info) => {
        try {
          await ledger.attemptStart({ request_id: requestId, attempt_number: info.attemptNumber, started_at: info.startedAt });
        } catch {
          logWriteFailure('attempt_start', requestId, info.attemptNumber);
        }
      };
      const onAttemptEnd = async (info) => {
        try {
          await writeWithRetry(() => ledger.attemptFinish(attemptRecord(requestId, info)), { sleep });
        } catch {
          logWriteFailure('attempt_finish', requestId, info.attemptNumber);
        }
      };

      /** @type {{ status: 'succeeded' | 'partial' | 'failed', httpStatus: number, body: object, errorCode?: string, counts?: object, error?: RequestError }} */
      let outcome;
      try {
        let modelItems = null;
        let outputError = null;
        try {
          const data = await callOpenAI(
            buildOpenAIRequest({
              model,
              reasoningEffort,
              productName: payload.productName,
              userPrompt: renderPromptTemplate(payload.prompt, payload.productName),
              images: payload.images,
            }),
            { apiKey, fetchImpl, sleep, random, logger, now, onAttemptStart, onAttemptEnd, ...(openAITimeoutMs ? { timeoutMs: openAITimeoutMs } : {}) },
          );
          modelItems = parseOpenAIOutput(data);
        } catch (error) {
          if (error instanceof UpstreamError && OUTPUT_ERROR_CODES.has(error.code)) {
            logger.warn('[suggest-image-names] unusable model output', { code: error.code });
            outputError = error.code;
          } else if (error instanceof UpstreamError) {
            const upstream = new RequestError(error.code, UPSTREAM_STATUS[error.code] || 502, undefined,
              error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {});
            outcome = {
              status: 'failed', httpStatus: upstream.status, errorCode: error.code, error: upstream,
              body: { error: { code: error.code, ...upstream.extra } },
              counts: { images_succeeded: 0, images_failed: requestedIds.length, needs_review_count: 0 },
            };
          } else {
            throw error;
          }
        }

        if (!outcome) {
          const items = [];
          let failed;
          if (outputError) {
            // HTTP 200, but nothing usable: a business failure, not a success.
            failed = requestedIds.map((imageId) => ({ imageId, code: outputError }));
          } else {
            const { matched, missingIds, unknownCount, duplicateCount } = matchItemsById(requestedIds, modelItems);
            if (unknownCount || duplicateCount || missingIds.length) {
              logger.warn('[suggest-image-names] model output mismatch', { unknownCount, duplicateCount, missing: missingIds.length });
            }
            const positions = new Map(payload.images.map((image) => [image.id, image.position]));
            failed = missingIds.map((imageId) => ({ imageId, code: 'missing' }));
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
          }
          outcome = {
            status: !items.length ? 'failed' : failed.length ? 'partial' : 'succeeded',
            httpStatus: 200,
            errorCode: outputError || (failed.length ? 'missing' : undefined),
            body: { items, failed, model },
            counts: {
              images_succeeded: items.length,
              images_failed: failed.length,
              needs_review_count: items.filter((item) => item.needsReview).length,
            },
          };
        }
      } catch (error) {
        logger.error('[suggest-image-names] unexpected error', { name: error?.name });
        const internal = new RequestError('internal_error', 500);
        outcome = {
          status: 'failed', httpStatus: 500, errorCode: 'internal_error', error: internal,
          body: { error: { code: 'internal_error' } },
          counts: { images_succeeded: 0, images_failed: requestedIds.length, needs_review_count: 0 },
        };
      }

      try {
        await writeWithRetry(() => ledger.finish({
          request_id: requestId,
          status: outcome.status,
          error_code: outcome.errorCode || null,
          http_status: outcome.httpStatus,
          ...outcome.counts,
          replay: { http_status: outcome.httpStatus, body: outcome.body },
        }), { sleep });
      } catch {
        // The request stays "running" and is swept to "unknown" later; the user still gets the answer.
        logWriteFailure('finish', requestId);
      }

      if (outcome.error) return errorResponse(outcome.error, cors, requestId);
      return json({ ...outcome.body, requestId }, 200, cors);
    } catch (error) {
      if (error instanceof RequestError) {
        if (context && ledger && RECORDED_REJECTIONS.has(error.code)) {
          try {
            await ledger.recordRejection({ ...context, code: error.code, http_status: error.status });
          } catch {
            logWriteFailure('rejection');
          }
        }
        return errorResponse(error, cors);
      }
      logger.error('[suggest-image-names] unexpected error', { name: error?.name });
      return json({ error: { code: 'internal_error', message: ERROR_MESSAGES.internal_error } }, 500, cors);
    }
  };
}
