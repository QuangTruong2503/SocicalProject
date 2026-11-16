import { load as loadJsx } from './memoryGameTransform.mjs';
export { resolve } from './aiRenameTransform.mjs';

// Keep the actual App routes and auth gates. Canvas/file processing and the
// unrelated app chrome are outside the scope of these navigation tests.
export async function load(url, context, nextLoad) {
  const pages = {
    '/src/pages/Watermark.jsx': 'Watermark content',
    '/src/pages/WatermarkAuto.jsx': 'Automatic watermark content',
    '/src/pages/AuthPage.jsx': 'Login page',
  };
  const page = Object.entries(pages).find(([suffix]) => url.endsWith(suffix));
  if (page) return { format: 'module', source: `export default function Page() { return ${JSON.stringify(page[1])}; }`, shortCircuit: true };
  if (['Header', 'Footer', 'ScrollToTopButton'].some((name) => url.endsWith(`/src/components/${name}.jsx`))) {
    return { format: 'module', source: 'export default function Chrome() { return null; }', shortCircuit: true };
  }
  return loadJsx(url, context, nextLoad);
}
