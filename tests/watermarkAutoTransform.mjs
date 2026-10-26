// /watermark/auto UI tests: the real page, hooks and services in jsdom. Swapped
// for fixtures: the Supabase client, the canvas engine/thumbnailer (jsdom has no
// canvas) and IndexedDB. Folders come from tests/fixtures/fakeFileSystem.mjs.
import { existsSync } from 'node:fs';

export { load } from './memoryGameTransform.mjs';

const MOCKS = {
  '/src/lib/supabase.js': './fixtures/aiRenameSupabaseMock.mjs',
  '/src/utils/imageThumbnail.js': './fixtures/aiRenameThumbnailMock.mjs',
  '/src/utils/watermarkEngine.js': './fixtures/watermarkAutoEngineMock.mjs',
  '/src/hooks/useIndexedDB.js': './fixtures/watermarkAutoIndexedDbMock.mjs',
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL) {
    const url = new URL(specifier, context.parentURL);
    const path = /\.[a-z]+$/i.test(url.pathname) ? url.pathname : `${url.pathname}.js`;
    const mock = Object.entries(MOCKS).find(([suffix]) => path.endsWith(suffix));
    if (mock) return { url: new URL(mock[1], import.meta.url).href, shortCircuit: true };
    if (!/\.[a-z]+$/i.test(url.pathname)) {
      for (const extension of ['.js', '.jsx']) {
        const candidate = new URL(`${url.href}${extension}`);
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
