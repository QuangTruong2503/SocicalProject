// JSX via the shared transform; the Supabase client and the canvas-based
// thumbnailer are swapped for fixtures. The real image-name service runs
// against a mocked global fetch — no network, no credentials.
import { existsSync } from 'node:fs';

export { load } from './memoryGameTransform.mjs';

const MOCKS = {
  '/src/lib/supabase.js': './fixtures/aiRenameSupabaseMock.mjs',
  '/src/utils/imageThumbnail.js': './fixtures/aiRenameThumbnailMock.mjs',
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL) {
    const url = new URL(specifier, context.parentURL);
    const mock = Object.entries(MOCKS).find(([suffix]) => url.pathname.endsWith(suffix));
    if (mock) return { url: new URL(mock[1], import.meta.url).href, shortCircuit: true };
    // Vite resolves extensionless imports (e.g. './ImageLightbox'); Node does not.
    if (!/\.[a-z]+$/i.test(url.pathname)) {
      for (const extension of ['.js', '.jsx']) {
        const candidate = new URL(`${url.href}${extension}`);
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
