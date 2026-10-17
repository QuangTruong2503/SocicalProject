export const supabaseConfig = { url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test', uploadBucket: 'test' };
// globalThis.__aiRenameSession: undefined → signed in, null → no session.
// globalThis.__aiAccessRpc(name): answer for supabase.rpc (default: can_use_ai_naming → true).
export const supabase = {
  auth: {
    getSession: async () => ({
      data: { session: globalThis.__aiRenameSession === undefined ? { access_token: 'user-jwt' } : globalThis.__aiRenameSession },
    }),
  },
  rpc: async (name, params) => {
    globalThis.__aiRpcCalls?.push({ name, params });
    return globalThis.__aiAccessRpc ? globalThis.__aiAccessRpc(name, params) : { data: true, error: null };
  },
};
