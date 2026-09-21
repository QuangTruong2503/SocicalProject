export function normalizeLocalPath(path, fallback = '/dashboard') {
  if (typeof path !== 'string' || !path.trim()) {
    return fallback;
  }

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const url = new URL(path, window.location.origin);

    if (url.origin !== window.location.origin || /^\/auth(?:\/|$)/i.test(url.pathname)) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function getAuthReturnPath(location) {
  return normalizeLocalPath(location.state?.from || new URLSearchParams(location.search).get('next'));
}
