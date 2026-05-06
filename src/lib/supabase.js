import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabaseUploadBucket = import.meta.env.VITE_SUPABASE_UPLOAD_BUCKET || 'user-images';
const supabaseAuthStorageKey = 'socicalproject.auth.token';

if (!supabaseUrl) {
  throw new Error('[supabase] Missing VITE_SUPABASE_URL.');
}

if (!supabasePublishableKey) {
  throw new Error('[supabase] Missing VITE_SUPABASE_PUBLISHABLE_KEY.');
}

console.debug('[supabase] Initializing browser client', {
  url: supabaseUrl,
  uploadBucket: supabaseUploadBucket,
  storageKey: supabaseAuthStorageKey,
});

function getStorageValue(key) {
  if (typeof document === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn('[supabase] Unable to read auth storage value', { key, error });
    return null;
  }
}

function setStorageValue(key, value) {
  if (typeof document === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error('[supabase] Unable to write auth storage value', { key, error });
  }
}

function removeStorageValue(key) {
  if (typeof document === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.error('[supabase] Unable to remove auth storage value', { key, error });
  }
}

const localStorageStorage = {
  getItem: (key) => getStorageValue(key),
  setItem: (key, value) => setStorageValue(key, value),
  removeItem: (key) => removeStorageValue(key),
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: localStorageStorage,
    storageKey: supabaseAuthStorageKey,
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
