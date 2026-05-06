import { supabase, describeSession } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

/**
 * @typedef {Object} AuthSnapshot
 * @property {import('@supabase/supabase-js').Session | null} session
 * @property {import('@supabase/supabase-js').User | null} user
 */

/**
 * @typedef {Object} SignUpPayload
 * @property {string} email
 * @property {string} password
 * @property {string} username
 */

/**
 * @typedef {Object} LoginPayload
 * @property {string} email
 * @property {string} password
 */

/**
 * @param {SignUpPayload} payload
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<{ user: import('@supabase/supabase-js').User | null, session: import('@supabase/supabase-js').Session | null, requiresEmailConfirmation: boolean }>>}
 */
export async function signUp({ email, password, username }) {
  try {
    console.debug('[authService] signUp start', { email, username });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });

    if (error) {
      console.error('[authService] signUp failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to sign up.'));
    }

    const result = {
      user: data.user ?? null,
      session: data.session ?? null,
      requiresEmailConfirmation: !data.session,
    };

    console.debug('[authService] signUp success', {
      session: describeSession(data.session),
      userId: data.user?.id ?? null,
      requiresEmailConfirmation: result.requiresEmailConfirmation,
    });

    return createServiceResult(result);
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to sign up.');
    console.error('[authService] signUp exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * @param {LoginPayload} payload
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<AuthSnapshot>>}
 */
export async function signIn({ email, password }) {
  try {
    console.debug('[authService] signIn start', { email });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[authService] signIn failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to sign in.'));
    }

    console.debug('[authService] signIn success', {
      session: describeSession(data.session),
      userId: data.user?.id ?? null,
    });

    return createServiceResult({
      session: data.session ?? null,
      user: data.user ?? null,
    });
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to sign in.');
    console.error('[authService] signIn exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * @param {string} redirectTo
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<boolean>>}
 */
export async function signInWithGoogle(redirectTo) {
  try {
    console.debug('[authService] signInWithGoogle start', { redirectTo });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });

    if (error) {
      console.error('[authService] signInWithGoogle failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to start Google sign-in.'));
    }

    return createServiceResult(true);
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to start Google sign-in.');
    console.error('[authService] signInWithGoogle exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<boolean>>}
 */
export async function signOut() {
  try {
    console.debug('[authService] signOut start');

    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      console.error('[authService] signOut failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to sign out.'));
    }

    console.debug('[authService] signOut success');
    return createServiceResult(true);
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to sign out.');
    console.error('[authService] signOut exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<AuthSnapshot>>}
 */
export async function getSessionSnapshot() {
  try {
    console.debug('[authService] getSessionSnapshot start');

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error('[authService] getSessionSnapshot failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to restore the session.'));
    }

    console.debug('[authService] getSessionSnapshot success', {
      session: describeSession(data.session),
      userId: data.session?.user?.id ?? null,
    });

    return createServiceResult({
      session: data.session ?? null,
      user: data.session?.user ?? null,
    });
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to restore the session.');
    console.error('[authService] getSessionSnapshot exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * @param {(payload: { event: string, session: import('@supabase/supabase-js').Session | null, user: import('@supabase/supabase-js').User | null }) => void} callback
 * @returns {import('@supabase/supabase-js').Subscription}
 */
export function subscribeToAuthChanges(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    console.debug('[authService] onAuthStateChange', {
      event,
      session: describeSession(session),
      userId: session?.user?.id ?? null,
    });

    callback({
      event,
      session: session ?? null,
      user: session?.user ?? null,
    });
  });

  return data.subscription;
}
