export const supabase = {
  rpc(name,args) {
    let signal; let promise;
    const request = {
      abortSignal(value) { signal=value; return request; },
      then(resolve,reject) { promise ??= Promise.resolve().then(() => globalThis.__adminQuotationRpc(name,args,signal)); return promise.then(resolve,reject); },
    };
    return request;
  },
  from(table) {
    const args={table};
    const request = {
      select(value) {args.select=value;return request;},eq(key,value) {args[key]=value;return request;},
      is() {return request;},order() {return request;},limit() {return request;},single() {return request;},maybeSingle() {return request;},
      then(resolve,reject) {return Promise.resolve().then(() => globalThis.__adminQuotationTable(args)).then(resolve,reject);},
    };
    return request;
  },
};
