import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabaseUploadBucket = import.meta.env.VITE_SUPABASE_UPLOAD_BUCKET || 'user-images';
const supabaseAuthCookieKey = 'socicalproject.auth.token';
const supabaseAuthCookieDays = 7;

if (!supabaseUrl) {
  throw new Error('[supabase] Missing VITE_SUPABASE_URL.');
}

if (!supabasePublishableKey) {
  throw new Error('[supabase] Missing VITE_SUPABASE_PUBLISHABLE_KEY.');
}

console.debug('[supabase] Initializing browser client', {
  url: supabaseUrl,
  uploadBucket: supabaseUploadBucket,
  storageKey: supabaseAuthCookieKey,
});

function getCookieValue(name) {
  if (typeof document === 'undefined') {
    return null;
  }

  const encodedName = `${encodeURIComponent(name)}=`;
  const parts = document.cookie ? document.cookie.split('; ') : [];

  for (const part of parts) {
    if (part.startsWith(encodedName)) {
      return decodeURIComponent(part.slice(encodedName.length));
    }
  }

  return null;
}

function setCookieValue(name, value, days) {
  if (typeof document === 'undefined') {
    return;
  }

  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax${secureFlag}`;
}

function removeCookieValue(name) {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = `${encodeURIComponent(name)}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
}

const cookieStorage = {
  getItem: (key) => getCookieValue(key),
  setItem: (key, value) => setCookieValue(key, value, supabaseAuthCookieDays),
  removeItem: (key) => removeCookieValue(key),
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: cookieStorage,
    storageKey: supabaseAuthCookieKey,
  },
});

export const supabaseConfig = {
  url: supabaseUrl,
  uploadBucket: supabaseUploadBucket,
};

export function describeSession(session) {
  if (!session) {
    return null;
  }

  return {
    accessTokenPresent: Boolean(session.access_token),
    refreshTokenPresent: Boolean(session.refresh_token),
    expiresAt: session.expires_at ?? null,
    userId: session.user?.id ?? null,
    email: session.user?.email ?? null,
  };
}
