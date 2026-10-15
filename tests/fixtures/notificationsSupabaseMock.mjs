export const supabaseConfig = { uploadBucket: 'test-bucket' };
export const supabase = {
  rpc: (name, payload) => globalThis.__notificationRpc(name, payload),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel() {},
};
