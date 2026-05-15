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

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
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
