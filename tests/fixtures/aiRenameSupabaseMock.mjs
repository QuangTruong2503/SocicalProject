export const supabaseConfig = { url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test', uploadBucket: 'test' };
// globalThis.__aiRenameSession: undefined → signed in, null → no session.
// globalThis.__aiAccessRpc(name): answer for supabase.rpc (default: all naming models).
export const supabase = {
  channel: () => {
    const channel = {
      on(_type, _filter, onInsert) { globalThis.__watermarkInsert = onInsert; return channel; },
      subscribe(onStatus) { onStatus('SUBSCRIBED'); return channel; },
    };
    return channel;
  },
  removeChannel: () => { globalThis.__watermarkInsert = null; globalThis.__watermarkUnsubscribed = true; },
  auth: {
    getSession: async () => ({
      data: { session: globalThis.__aiRenameSession === undefined ? { access_token: 'user-jwt' } : globalThis.__aiRenameSession },
    }),
  },
  rpc: async (name, params) => {
    globalThis.__aiRpcCalls?.push({ name, params });
    return globalThis.__aiAccessRpc ? globalThis.__aiAccessRpc(name, params) : { data: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'], error: null };
  },
};
