/**
 * @template T
 * @typedef {Object} ServiceResult
 * @property {T | null} data
 * @property {string | null} error
 * @property {string | null} warning
 */

/**
 * @param {unknown} error
 * @param {string} fallbackMessage
 * @returns {string}
 */
export function normalizeServiceError(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return fallbackMessage;
}

/**
 * @template T
 * @param {T | null} data
 * @param {string | null} error
 * @param {string | null} warning
 * @returns {ServiceResult<T>}
 */
export function createServiceResult(data = null, error = null, warning = null) {
  return { data, error, warning };
}
