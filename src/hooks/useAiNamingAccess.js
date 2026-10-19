import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth.js';
import { AI_NAMING_ERRORS, fetchAiNamingAccess } from '../services/imageNameService.js';

/**
 * UI state for "Đặt tên AI": 'loading' | 'allowed' | 'denied' | 'signed_out' | 'error'.
 * Asks the server (ai_naming_models) instead of re-implementing the rule;
 * the Edge Function checks again on every request, so this only drives the UI.
 */
export function useAiNamingAccess() {
  const { user, profile, isInitializing } = useAuth();
  const userId = user?.id ?? null;
  const [reloadToken, setReloadToken] = useState(0);
  // Re-check when the account changes or its profile is reloaded with another role/plan/status.
  const key = userId ? [userId, profile?.role, profile?.plan, profile?.status, reloadToken].join('|') : null;
  const [result, setResult] = useState({ key: null, status: 'loading', error: null });

  useEffect(() => {
    if (isInitializing || !key) return undefined;
    let active = true;
    fetchAiNamingAccess().then(({ data, models, error }) => {
      if (active) setResult({ key, status: error ? 'error' : data ? 'allowed' : 'denied', models, error });
    });
    return () => { active = false; };
  }, [isInitializing, key]);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    if (!userId) return undefined;
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [userId, refresh]);

  /** The backend refused a request: show that state until the next check. */
  const reportRejection = useCallback((code) => {
    if (code === AI_NAMING_ERRORS.authRequired) setResult({ key, status: 'signed_out', error: null });
    else if (code === AI_NAMING_ERRORS.accessDenied) setResult({ key, status: 'denied', error: null });
    else if (code === AI_NAMING_ERRORS.modelDenied) refresh();
  }, [key, refresh]);

  const current = result.key === key ? result : null;
  let status = current?.status ?? 'loading';
  if (isInitializing) status = 'loading';
  else if (!userId) status = 'signed_out';

  return { status, models: status === 'allowed' ? current?.models ?? [] : [], error: current?.error ?? null, refresh, reportRejection };
}
