export const supabaseConfig = { uploadBucket: 'test-bucket' };
export const supabase = {
  rpc(name, payload) {
    return { abortSignal: (signal) => globalThis.__memoryRpc(name, payload, signal) };
  },
  from() {
    const query = {
      select: () => query, order: () => query, limit: () => query,
      abortSignal: (signal) => globalThis.__memoryCards(signal),
    };
    return query;
  },
};
