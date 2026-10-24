export const supabase = {
  rpc: (name, args) => Promise.resolve().then(() => globalThis.__productRpc(name, args)),
  from(table) {
    const args = { table, filters: {} };
    const request = {
      select() { return request; },
      insert(value) { args.operation = 'insert'; args.value = value; return request; },
      update(value) { args.operation = 'update'; args.value = value; return request; },
      delete() { args.operation = 'delete'; return request; },
      eq(key, value) { args.filters[key] = value; return request; },
      lt() { return request; },
      order() { return request; },
      range(from, to) { args.range = [from, to]; return request; },
      limit() { return request; },
      single() { return request; },
      then(resolve, reject) { return Promise.resolve().then(() => globalThis.__productTable(args)).then(resolve, reject); },
    };
    return request;
  },
  channel() {
    const channel = {
      listeners: [], removed: false,
      on(type, filter, callback) { channel.listeners.push({ type, filter, callback }); return channel; },
      subscribe() { globalThis.__productChannels.push(channel); return channel; },
    };
    return channel;
  },
  removeChannel(channel) { channel.removed = true; },
};
