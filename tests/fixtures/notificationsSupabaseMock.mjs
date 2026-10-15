export const supabaseConfig = { uploadBucket: 'test-bucket' };
export const supabase = {
  rpc: (name, payload) => globalThis.__notificationRpc(name, payload),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel() {},
  storage: { from: (bucket) => ({
    upload: (path, file, options) => globalThis.__notificationStorage('upload', { bucket, path, file, options }),
    remove: (paths) => globalThis.__notificationStorage('remove', { bucket, paths }),
    createSignedUrl: (path, expiresIn) => globalThis.__notificationStorage('sign', { bucket, path, expiresIn }),
  }) },
};
