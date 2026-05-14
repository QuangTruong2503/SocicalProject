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
  const rawMessage = (
    error instanceof Error && error.message
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : ''
  ).toLowerCase();

  if (rawMessage.includes('invalid login credentials')) {
    return 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.';
  }

  if (rawMessage.includes('email not confirmed')) {
    return 'Email này chưa được xác thực. Hãy kiểm tra hộp thư trước khi đăng nhập.';
  }

  if (rawMessage.includes('user already registered') || rawMessage.includes('already exists')) {
    return 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.';
  }

  if (rawMessage.includes('password') && rawMessage.includes('weak')) {
    return 'Mật khẩu chưa đủ mạnh. Hãy dùng mật khẩu dài hơn và khó đoán hơn.';
  }

  if (rawMessage.includes('current password')) {
    return 'Mật khẩu hiện tại chưa đúng. Vui lòng kiểm tra lại.';
  }

  if (rawMessage.includes('same password')) {
    return 'Mật khẩu mới cần khác mật khẩu hiện tại.';
  }

  if (rawMessage.includes('rate limit') || rawMessage.includes('too many')) {
    return 'Bạn thao tác hơi nhanh. Vui lòng thử lại sau ít phút.';
  }

  if (rawMessage.includes('network') || rawMessage.includes('fetch')) {
    return 'Không thể kết nối tới máy chủ xác thực. Vui lòng kiểm tra mạng và thử lại.';
  }

  if (error instanceof Error && error.message) {
    return fallbackMessage;
  }

  if (typeof error === 'string' && error.trim()) {
    return fallbackMessage;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return fallbackMessage;
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
