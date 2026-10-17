import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pdfjsRoot = resolve('node_modules/pdfjs-dist')
const pdfjsVersion = JSON.parse(readFileSync(join(pdfjsRoot, 'package.json'), 'utf8')).version
// Font, CMap, ICC and WASM decoder files PDF.js fetches at runtime (JPEG 2000 and
// JBIG2 scans need the WASM). quickjs is only for form scripting, which is off.
const pdfjsAssetDirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs']
const skipPdfjsAsset = (path) => /quickjs/.test(path)
const mimeTypes = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.icc': 'application/vnd.iccprofile' }

/** Serves the PDF.js assets in dev and copies them to dist/pdfjs/<version>/ on build. */
function pdfjsAssets() {
  let outDir = 'dist'
  return {
    name: 'pdfjs-assets',
    config: () => ({ define: { __PDFJS_ASSET_VERSION__: JSON.stringify(pdfjsVersion) } }),
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      const prefix = `/pdfjs/${pdfjsVersion}/`
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url || '').split('?')[0])
        if (!path.startsWith(prefix)) return next()
        const relative = normalize(path.slice(prefix.length))
        const file = join(pdfjsRoot, relative)
        const allowed = pdfjsAssetDirs.some((dir) => relative.startsWith(dir)) && !relative.includes('..') && !skipPdfjsAsset(relative)
        if (!allowed || !existsSync(file) || !statSync(file).isFile()) return next()
        const extension = file.slice(file.lastIndexOf('.'))
        res.setHeader('Content-Type', mimeTypes[extension] || 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      for (const dir of pdfjsAssetDirs) {
        cpSync(join(pdfjsRoot, dir), join(outDir, 'pdfjs', pdfjsVersion, dir), { recursive: true, filter: (path) => !skipPdfjsAsset(path) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  // Expose the public Turnstile site key alongside the default VITE_ variables.
  envPrefix: ['VITE_', 'TURNSTILE_CAPTCHA_SITE_KEY'],
})
