// Transport stand-in for src/lib/supabase.js. Each test sets globalThis.__frames*
// handlers; the production services and components run unchanged on top.
export const supabaseConfig = { url: 'https://project.test', publishableKey: 'test', uploadBucket: 'user-images' };
export function describeSession() { return null; }

function deferred(run) {
  return { then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); } };
}

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: globalThis.__framesSession ?? null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  },
  rpc(name, args) {
    return deferred(() => globalThis.__framesRpc(name, args));
  },
  from(table) {
    const args = { table, filters: {}, orders: [] };
    const request = {
      select(value, options) { args.select = value; args.options = options; return request; },
      insert(value) { args.operation = 'insert'; args.value = value; return request; },
      update(value) { args.operation = 'update'; args.value = value; return request; },
      delete() { args.operation = 'delete'; return request; },
      eq(key, value) { args.filters[key] = value; return request; },
      in(key, value) { args.filters[key] = value; return request; },
      order(key, options) { args.orders.push([key, options]); return request; },
      range(from, to) { args.range = [from, to]; return request; },
      limit(value) { args.limit = value; return request; },
      single() { args.single = true; return request; },
      maybeSingle() { args.maybeSingle = true; return request; },
      abortSignal() { return request; },
      then(resolve, reject) { return Promise.resolve().then(() => globalThis.__framesTable(args)).then(resolve, reject); },
    };
    return request;
  },
  storage: {
    from(bucket) {
      return {
        upload: async (path, file, options) => globalThis.__framesStorage({ operation: 'upload', bucket, path, file, options }),
        remove: async (paths) => globalThis.__framesStorage({ operation: 'remove', bucket, paths }),
        getPublicUrl: (path) => ({ data: { publicUrl: `https://project.test/storage/v1/object/public/${bucket}/${path}` } }),
      };
    },
  },
  channel() { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: async () => {},
};
