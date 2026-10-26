// Records what the page asks the engine; output blobs say what was drawn.
export function createWatermarkEngine() {
  const engine = {
    async setLogo(url) { globalThis.__autoEngine.logos.push(url); },
    async render(file, options, overrides = {}) {
      globalThis.__autoEngine.renders.push({ name: file.name, options, overrides });
      if (globalThis.__autoEngine.renderGate) await globalThis.__autoEngine.renderGate;
      return { blob: new Blob([`wm(${file.name})`], { type: 'image/jpeg' }), thumbBlob: new Blob(['t'], { type: 'image/jpeg' }), engine: 'main' };
    },
    async resize(blob, width, height) {
      globalThis.__autoEngine.resizes.push([width, height]);
      return new Blob([await blob.text(), `@${width}x${height}`], { type: 'image/jpeg' });
    },
    usesWorker: async () => false,
    dispose() { globalThis.__autoEngine.disposed += 1; },
  };
  return engine;
}
