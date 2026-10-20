import { load as commonLoad } from './adminQuotationsTransform.mjs';

// JSX and CSS modules as in the other UI tests; Supabase replaced by a transport
// fixture. Extensionless relative imports (resolved by Vite in the app, e.g.
// '../hooks/useTheme' in Header.jsx) are retried with .js / .jsx.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && new URL(specifier, context.parentURL).pathname.endsWith('/src/lib/supabase.js')) {
    return { url: new URL('./fixtures/avatarFramesSupabaseMock.mjs', import.meta.url).href, shortCircuit: true };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) throw error;
    for (const extension of ['.js', '.jsx']) {
      try {
        return await nextResolve(`${specifier}${extension}`, context);
      } catch {
        // try the next extension
      }
    }
    throw error;
  }
}

export { commonLoad as load };
