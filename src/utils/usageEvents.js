/**
 * Activity events for /watermark (schema v1, see docs/usage-logging.md).
 * Product analytics only: they describe what the browser did locally and are
 * never used for billing or AI quotas. No image content, file name or product
 * name ever goes in an event — only IDs, counts and fixed codes.
 *
 * Counts: requested = succeeded + failed + skipped + cancelled, where
 *   skipped   = not attempted because the file was unreadable,
 *   cancelled = not attempted / not delivered because the user stopped,
 *   failed    = attempted and failed.
 */
export const USAGE_EVENT_SCHEMA_VERSION = 1;
const SOURCE_PAGE = 'watermark';

export const newUsageId = () => crypto.randomUUID();

/**
 * Who an operation belongs to, fixed when it starts: a task started as guest
 * stays a guest task even if the person signs in before it ends.
 */
export function createSubject(userId, visitorId) {
  return userId ? { userId, visitorId: null } : { userId: null, visitorId: visitorId || null };
}

// `sourcePage` is optional on every builder: /watermark keeps the default, /watermark/auto passes 'watermark/auto'.
function baseEvent({ subject, action, feature = 'watermark', operationId = newUsageId(), imageBatchId = null, aiRunId = null, status, sourcePage = SOURCE_PAGE }) {
  return {
    schemaVersion: USAGE_EVENT_SCHEMA_VERSION,
    eventId: newUsageId(),
    operationId,
    imageBatchId,
    aiRunId,
    subjectUserId: subject.userId,
    visitorId: subject.visitorId,
    feature,
    action,
    sourcePage,
    status,
    occurredAt: new Date().toISOString(),
  };
}

const roundMs = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : null);

/** One "Tạo ảnh watermark" run. `aborted`: the user pressed "Dừng lại" (or left the page). */
export function buildCreateEvent({ subject, imageBatchId, requested, succeeded, failed, skipped, cancelled, aborted, durationMs, errorCode = null, sourcePage }) {
  const status = aborted ? 'cancelled' : !succeeded ? 'failed' : failed || skipped || cancelled ? 'partial' : 'succeeded';
  return {
    ...baseEvent({ subject, action: 'image.create', imageBatchId, status, sourcePage }),
    requestedCount: requested,
    succeededCount: succeeded,
    failedCount: failed,
    skippedCount: skipped,
    cancelledCount: cancelled,
    durationMs: roundMs(durationMs),
    errorCode,
  };
}

/**
 * One download action. `outcome` comes from runBatchDownload: `delivered` is
 * what was actually handed to the browser (anchor download) or written to the
 * chosen file — never images merely prepared or added to an unfinished ZIP.
 */
export function buildDownloadEvent({ subject, imageBatchId, method, imageSize, requested, outcome, durationMs, errorCode = null, sourcePage }) {
  const delivered = outcome.delivered;
  let status = 'succeeded';
  let failed = 0;
  let cancelled = 0;
  if (outcome.error) {
    status = delivered ? 'partial' : 'failed';
    failed = requested - delivered;
  } else if (outcome.cancelled) {
    status = 'cancelled';
    cancelled = requested - delivered;
  }
  return {
    ...baseEvent({ subject, action: 'image.download', imageBatchId, status, sourcePage }),
    requestedCount: requested,
    preparedCount: outcome.prepared,
    succeededCount: delivered,
    failedCount: failed,
    cancelledCount: cancelled,
    downloadMethod: method,
    imageSize,
    delivery: delivered ? outcome.delivery : null,
    outputFileCount: outcome.outputFiles,
    imagesInFiles: delivered,
    durationMs: roundMs(durationMs),
    errorCode: errorCode || (outcome.error ? `${outcome.stage || 'prepare'}_failed` : null),
  };
}

/** "Tải xuống" on one result card: an anchor download handed to the browser. */
export function buildSingleDownloadEvent({ subject, imageBatchId }) {
  return buildDownloadEvent({
    subject,
    imageBatchId,
    method: 'single',
    imageSize: 'original',
    requested: 1,
    outcome: { prepared: 1, delivered: 1, outputFiles: 1, delivery: 'browser_handoff', cancelled: false, error: null },
  });
}

/**
 * "Áp dụng tên" in the AI dialog: the user used suggestions. One event per AI
 * run involved (names typed without AI form a group without run ID), sharing
 * one operation ID. Applying never calls the API, so it creates no AI usage.
 */
export function buildApplyEvents({ subject, imageBatchId, groups, sourcePage }) {
  const operationId = newUsageId();
  return groups.filter((group) => group.applied > 0).map((group) => ({
    ...baseEvent({ subject, action: 'ai.naming.apply', feature: 'ai_image_naming', operationId, imageBatchId, aiRunId: group.aiRunId, status: 'succeeded', sourcePage }),
    requestedCount: group.applied,
    succeededCount: group.applied,
    metadata: { ai_unchanged_count: group.aiUnchanged, edited_count: group.edited },
  }));
}
