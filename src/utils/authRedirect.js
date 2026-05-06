export function normalizeLocalPath(path, fallback = '/dashboard') {
  if (typeof path !== 'string' || !path.trim()) {
    return fallback;
  }

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const url = new URL(path, window.location.origin);

    if (url.origin !== window.location.origin) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
