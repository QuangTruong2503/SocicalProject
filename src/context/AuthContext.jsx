import { createContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabase.js';

export const AuthContext = createContext(null);

function buildProfilePayload(user) {
  const fallbackUsername = user.email?.split('@')[0] || 'user';

  return {
    id: user.id,
    username: user.user_metadata?.username || fallbackUsername,
    email: user.email || '',
    created_at: user.created_at || new Date().toISOString(),
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapAuth() {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        setSession(null);
        setUser(null);
        setProfile(null);
      } else {
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
      }

      setLoading(false);
    }

    bootstrapAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function syncProfile() {
      if (!user?.id) {
        setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, email, created_at')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (error) {
        setProfile(null);
        return;
      }

      if (data) {
        setProfile(data);
        return;
      }

      const profilePayload = buildProfilePayload(user);
      const { data: insertedProfile, error: upsertError } = await supabase
        .from('profiles')
        .upsert(profilePayload)
        .select('id, username, email, created_at')
        .single();

      if (!isMounted) {
        return;
      }

      if (upsertError) {
        setProfile(null);
        return;
      }

      setProfile(insertedProfile ?? profilePayload);
    }

    syncProfile();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const value = useMemo(() => ({
    session,
    user,
    profile,
    loading,
    isAuthenticated: Boolean(user),
    refreshProfile: async () => {
      if (!user?.id) {
        setProfile(null);
        return null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, email, created_at')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        return null;
      }

      if (data) {
        setProfile(data);
        return data;
      }

      const profilePayload = buildProfilePayload(user);
      const { data: insertedProfile, error: upsertError } = await supabase
        .from('profiles')
        .upsert(profilePayload)
        .select('id, username, email, created_at')
        .single();

      if (upsertError) {
        return null;
      }

      setProfile(insertedProfile ?? profilePayload);
      return insertedProfile ?? profilePayload;
    },
  }), [loading, profile, session, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
