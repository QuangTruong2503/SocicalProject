import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

// Run the actual JSX component in jsdom with the production service layer and
// a transport fixture. Tests never use credentials or contact a live database.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && new URL(specifier, context.parentURL).pathname.endsWith('/src/lib/supabase.js')) {
    return { url: new URL('./fixtures/memorySupabaseMock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };
  if (url.endsWith('/src/data/cards.json')) return { format: 'module', source: `export default ${await readFile(new URL(url), 'utf8')};`, shortCircuit: true };
  if (url.endsWith('.jsx')) {
    const source = await readFile(new URL(url), 'utf8');
    const result = await transformWithOxc(source, new URL(url).pathname, { jsx: { runtime: 'automatic' } });
    return { format: 'module', source: result.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
