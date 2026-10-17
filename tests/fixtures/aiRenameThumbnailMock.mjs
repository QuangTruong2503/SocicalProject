// Records which source was downscaled; a source named "broken" cannot be decoded.
export async function createThumbnailBlob(source, maxDimension, quality) {
  globalThis.__aiThumbnailCalls?.push({ source, maxDimension, quality });
  if (source?.name === 'broken') throw new Error('decode failed');
  return new globalThis.window.Blob(['jpeg-bytes'], { type: 'image/jpeg' });
}
export async function generateThumbnails() {}
