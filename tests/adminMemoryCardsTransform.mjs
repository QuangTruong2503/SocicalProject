import {load as commonLoad} from './adminQuotationsTransform.mjs';
export async function resolve(specifier,context,nextResolve) {
  if(specifier.startsWith('.') && new URL(specifier,context.parentURL).pathname.endsWith('/src/lib/supabase.js'))return {url:new URL('./fixtures/adminMemoryCardsSupabaseMock.mjs',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
export {commonLoad as load};
