import {
  useCallback,
  startTransition,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  getSessionSnapshot,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  subscribeToAuthChanges,
} from '../services/authService.js';
import {
  ensureProfile,
  updateProfile as updateProfileService,
} from '../services/profileService.js';
import { fetchLatestUserUpload } from '../services/uploadService.js';
import { createServiceResult } from '../services/serviceHelpers.js';
import { AuthContext } from './authContext.js';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [latestUpload, setLatestUpload] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const [lastAuthEvent, setLastAuthEvent] = useState('INITIALIZING');
  const profileRequestIdRef = useRef(0);
  const avatarRequestIdRef = useRef(0);

  const syncProfile = useCallback(async (nextUser, source) => {
    const requestId = ++profileRequestIdRef.current;

    if (!nextUser?.id) {
      setProfile(null);
      setProfileError(null);
      setIsProfileLoading(false);
      return createServiceResult(null);
    }

    console.debug('[AuthContext] syncProfile start', {
      source,
      userId: nextUser.id,
      email: nextUser.email ?? null,
    });

    setIsProfileLoading(true);
    setProfileError(null);

    const result = await ensureProfile(nextUser);

    if (profileRequestIdRef.current !== requestId) {
      console.debug('[AuthContext] syncProfile ignored stale result', {
        source,
        userId: nextUser.id,
        requestId,
      });
      return result;
    }

    if (result.error) {
      console.error('[AuthContext] syncProfile failed', {
        source,
        userId: nextUser.id,
        error: result.error,
      });
      setProfile(null);
      setProfileError(result.error);
      setIsProfileLoading(false);
      return result;
    }

    console.debug('[AuthContext] syncProfile success', {
      source,
      userId: nextUser.id,
      hasProfile: Boolean(result.data),
    });

    setProfile(result.data);
    setProfileError(result.warning ?? null);
    setIsProfileLoading(false);
    return result;
  }, []);

  const syncLatestUpload = useCallback(async (nextUser, source) => {
    const requestId = ++avatarRequestIdRef.current;

    if (!nextUser?.id) {
      setLatestUpload(null);
      setUploadError(null);
      setIsAvatarLoading(false);
      return createServiceResult(null);
    }

    console.debug('[AuthContext] syncLatestUpload start', {
      source,
      userId: nextUser.id,
    });

    setIsAvatarLoading(true);
    setUploadError(null);

    const result = await fetchLatestUserUpload(nextUser.id);

    if (avatarRequestIdRef.current !== requestId) {
      console.debug('[AuthContext] syncLatestUpload ignored stale result', {
        source,
        userId: nextUser.id,
        requestId,
      });
      return result;
    }

    if (result.error) {
      console.error('[AuthContext] syncLatestUpload failed', {
        source,
        userId: nextUser.id,
        error: result.error,
      });
      setLatestUpload(null);
      setUploadError(result.error);
      setIsAvatarLoading(false);
      return result;
    }

    console.debug('[AuthContext] syncLatestUpload success', {
      source,
      userId: nextUser.id,
      hasUpload: Boolean(result.data),
    });

    setLatestUpload(result.data);
    setUploadError(result.warning ?? null);
    setIsAvatarLoading(false);
    return result;
  }, []);

  const applySessionState = useCallback(async ({ nextSession, event, source }) => {
    const nextUser = nextSession?.user ?? null;

    console.debug('[AuthContext] applySessionState', {
      source,
      event,
      userId: nextUser?.id ?? null,
      email: nextUser?.email ?? null,
      expiresAt: nextSession?.expires_at ?? null,
    });

    startTransition(() => {
      setSession(nextSession ?? null);
      setUser(nextUser);
      setLastAuthEvent(event);
      setAuthError(null);
    });

    if (!nextUser) {
      profileRequestIdRef.current += 1;
      avatarRequestIdRef.current += 1;
      setProfile(null);
      setLatestUpload(null);
      setProfileError(null);
      setUploadError(null);
      setIsProfileLoading(false);
      setIsAvatarLoading(false);
      setIsInitializing(false);
      return;
    }

    await syncProfile(nextUser, source);
    await syncLatestUpload(nextUser, source);
    setIsInitializing(false);
  }, [syncLatestUpload, syncProfile]);

  useEffect(() => {
    let isActive = true;

    async function initializeAuth() {
      setIsInitializing(true);

      const snapshotResult = await getSessionSnapshot();

      if (!isActive) {
        return;
      }

      if (snapshotResult.error) {
        setAuthError(snapshotResult.error);
        await applySessionState({
          nextSession: null,
          event: 'INITIAL_SESSION_ERROR',
          source: 'bootstrap-error',
        });
        return;
      }

      await applySessionState({
        nextSession: snapshotResult.data?.session ?? null,
        event: 'INITIAL_SESSION',
        source: 'bootstrap',
      });
    }

    initializeAuth();

    const subscription = subscribeToAuthChanges(({ event, session: nextSession }) => {
      window.setTimeout(() => {
        if (!isActive) {
          return;
        }

        applySessionState({
          nextSession,
          event,
          source: event === 'TOKEN_REFRESHED' ? 'token-refresh' : 'listener',
        });
      }, 0);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [applySessionState]);

  async function login({ email, password }) {
    setAuthError(null);
    const result = await signIn({ email, password });

    if (result.error) {
      setAuthError(result.error);
      return result;
    }

    if (result.data?.session) {
      await applySessionState({
        nextSession: result.data.session,
        event: 'SIGNED_IN_REQUEST',
        source: 'login-action',
      });
    }

    return result;
  }

  async function signup({ email, password, username }) {
    setAuthError(null);
    const result = await signUp({ email, password, username });

    if (result.error) {
      setAuthError(result.error);
      return result;
    }

    if (result.data?.session) {
      await applySessionState({
        nextSession: result.data.session,
        event: 'SIGNED_UP_REQUEST',
        source: 'signup-action',
      });
    }

    return result;
  }

  async function loginWithGoogle(redirectPath = '/dashboard') {
    setAuthError(null);
    const redirectUrl = new URL('/auth/callback', window.location.origin);
    redirectUrl.searchParams.set('next', redirectPath);

    const result = await signInWithGoogle(redirectUrl.toString());

    if (result.error) {
      setAuthError(result.error);
    }

    return result;
  }

  async function logout() {
    const result = await signOut();

    if (result.error) {
      setAuthError(result.error);
    }

    return result;
  }

  async function refreshSession() {
    const snapshotResult = await getSessionSnapshot();

    if (snapshotResult.error) {
      setAuthError(snapshotResult.error);
      return snapshotResult;
    }

    await applySessionState({
      nextSession: snapshotResult.data?.session ?? null,
      event: 'SESSION_REFRESH_REQUEST',
      source: 'manual-refresh',
    });

    return snapshotResult;
  }

  async function refreshProfile() {
    if (!user?.id) {
      const result = createServiceResult(null, 'A signed-in user is required to refresh the profile.');
      setProfile(null);
      setProfileError(result.error);
      return result;
    }

    return syncProfile(user, 'refresh-profile');
  }

  async function refreshAvatar() {
    if (!user?.id) {
      const result = createServiceResult(null, 'A signed-in user is required to refresh the avatar.');
      setLatestUpload(null);
      setUploadError(result.error);
      return result;
    }

    return syncLatestUpload(user, 'refresh-avatar');
  }

  async function updateProfile(updates) {
    if (!user?.id) {
      const result = createServiceResult(null, 'A signed-in user is required to update the profile.');
      setProfileError(result.error);
      return result;
    }

    const result = await updateProfileService(user.id, updates);

    if (result.error) {
      setProfileError(result.error);
      return result;
    }

    setProfile(result.data);
    setProfileError(result.warning ?? null);
    return result;
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        latestUpload,
        authError,
        profileError,
        uploadError,
        isInitializing,
        isProfileLoading,
        isAvatarLoading,
        isAuthenticated: Boolean(user),
        lastAuthEvent,
        login,
        signup,
        loginWithGoogle,
        logout,
        refreshSession,
        refreshProfile,
        refreshAvatar,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
