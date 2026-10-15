import { load as commonLoad } from './memoryGameTransform.mjs';
export async function resolve(specifier,context,nextResolve) {
  if (specifier.startsWith('.') && new URL(specifier,context.parentURL).pathname.endsWith('/src/lib/supabase.js')) {
    return {url:new URL('./fixtures/adminQuotationsSupabaseMock.mjs',import.meta.url).href,shortCircuit:true};
  }
  return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad) {
  if (url.endsWith('.css')) return {format:'module',source:'export default new Proxy({}, {get: (_,key) => String(key)});',shortCircuit:true};
  return commonLoad(url,context,nextLoad);
}
