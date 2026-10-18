/**
 * Server-side usage ledger for "Đặt tên ảnh bằng AI": the Edge Function writes
 * requests and attempts through the service-role RPCs of
 * supabase/migrations/20261018090000_usage_ledger.sql. Runtime-agnostic (Deno
 * in production, Node in tests): fetch, clock and sleep are injected.
 *
 * Nothing written here comes from the request body except validated IDs and
 * counts: the user is the verified JWT subject, model / key alias /
 * environment come from server env, tokens from the provider response.
 */

const RPC_TIMEOUT_MS = 5_000;
const KEY_ALIAS_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ENVIRONMENT_PATTERN = /^[a-z0-9_-]{1,32}$/;

export class LedgerError extends Error {
  constructor(step, status = 0) {
    super(`ledger ${step} failed`);
    this.name = 'LedgerError';
    this.step = step;
    this.status = status;
  }
}

/**
 * Server key for PostgREST, from the env names Supabase provisions. The new
 * secret keys (sb_secret_…) are not JWTs and go in `apikey` only; the legacy
 * service_role JWT also goes in `Authorization`.
 * @returns {{ key: string, headers: Record<string, string> } | null}
 */
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
  return {
    key,
    headers: key.startsWith('sb_secret_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` },
  };
}

/** Label of the OpenAI key from OPENAI_IMAGE_NAME_KEY_ALIAS; refused if it looks like (part of) a secret. */
export function resolveKeyAlias(getEnv) {
  const alias = String(getEnv('OPENAI_IMAGE_NAME_KEY_ALIAS') || '').trim().toLowerCase();
  if (!alias) return { alias: 'unlabeled', valid: true };
  const secret = String(getEnv('OPENAI_IMAGE_NAME_KEY') || '').toLowerCase();
  const looksSecret = /^(sk|sb_secret|rk)[-_]/.test(alias)
    || (secret.length >= 8 && (alias.includes(secret) || (alias.length >= 8 && secret.includes(alias))));
  if (looksSecret || !KEY_ALIAS_PATTERN.test(alias)) return { alias: 'invalid-alias', valid: false };
  return { alias, valid: true };
}

export function resolveEnvironment(getEnv) {
  const value = String(getEnv('AI_USAGE_ENVIRONMENT') || '').trim().toLowerCase();
  return ENVIRONMENT_PATTERN.test(value) ? value : 'unknown';
}

const encoder = new TextEncoder();
const toHex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(message));
}

/**
 * HMAC-SHA256 of the normalized payload, to tell a resend of the same operation
 * from a different payload under the same request ID. Only this digest is
 * stored — never the images, product name or prompt. The key is
 * AI_USAGE_FINGERPRINT_SECRET, or else derived from the OpenAI key (so rotating
 * that key only affects in-flight resends).
 */
export async function computeFingerprint(getEnv, { productName, prompt, images }) {
  const dedicated = getEnv('AI_USAGE_FINGERPRINT_SECRET');
  const keyBytes = dedicated
    ? encoder.encode(dedicated)
    : new Uint8Array(await hmacSha256(encoder.encode(getEnv('OPENAI_IMAGE_NAME_KEY') || ''), 'suggest-image-names/fingerprint/v1'));
  const canonical = JSON.stringify({
    productName,
    prompt,
    images: images.map((image) => [image.id, image.position, image.dataUrl]),
  });
  return toHex(await hmacSha256(keyBytes, canonical));
}

/**
 * Ledger backed by PostgREST RPCs, authenticated with the server key.
 * Errors never include response bodies (they could echo payloads).
 */
export function createPostgrestLedger({ supabaseUrl, credentials, fetchImpl, timeoutMs = RPC_TIMEOUT_MS }) {
  const call = async (name, payload) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response;
      try {
        response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`, {
          method: 'POST',
          headers: { ...credentials.headers, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ p_payload: payload }),
          signal: controller.signal,
        });
      } catch {
        throw new LedgerError(name, 0);
      }
      if (!response.ok) throw new LedgerError(name, response.status);
      try {
        return await response.json();
      } catch {
        throw new LedgerError(name, response.status);
      }
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    begin: (payload) => call('ai_usage_begin', payload),
    attemptStart: (payload) => call('ai_usage_attempt_start', payload),
    attemptFinish: (payload) => call('ai_usage_attempt_finish', payload),
    finish: (payload) => call('ai_usage_finish', payload),
    recordRejection: (payload) => call('ai_usage_record_rejection', payload),
  };
}

/**
 * Bounded retries for idempotent ledger writes (same IDs every time). The
 * provider is never called again to recover a lost write.
 */
export async function writeWithRetry(write, { sleep, attempts = 3, baseDelayMs = 250 }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await write();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(baseDelayMs * attempt);
    }
  }
  throw lastError;
}

/** Shape stored by ai_usage_attempt_finish for one provider attempt. */
export function attemptRecord(requestId, info) {
  return {
    request_id: requestId,
    attempt_number: info.attemptNumber,
    status: info.status,
    error_code: info.errorCode,
    provider_error_code: info.providerErrorCode,
    http_status: info.httpStatus,
    will_retry: info.willRetry,
    retry_reason: info.retryReason,
    provider_request_id: info.providerRequestId,
    provider_response_id: info.providerResponseId,
    resolved_model: info.resolvedModel,
    service_tier: info.serviceTier,
    response_status: info.responseStatus,
    started_at: info.startedAt,
    ended_at: info.endedAt,
    latency_ms: info.latencyMs,
    usage_status: info.usageStatus,
    usage: info.usage,
  };
}
