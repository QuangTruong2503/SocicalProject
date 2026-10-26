// DOM-free watermark drawing, shared by the Web Worker (OffscreenCanvas) and the
// main-thread fallback (<canvas>) so both produce identical images.

/** Longest edge of an exported image. 4096² is also iOS Safari's canvas area limit. */
export const MAX_OUTPUT_DIMENSION = 4096;
/** maxDimension value that keeps the decoded (EXIF-oriented) size: fitWithin() never scales for 0. */
export const KEEP_ORIGINAL_SIZE = 0;

export const LOGO_POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

// Upper bound on tiled draw calls, for tiny logos on huge images.
const MAX_TILES = 4000;

export function bounded(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

/** Scale (width, height) down so the longest edge is at most maxDimension. Never upscales. */
export function fitWithin(width, height, maxDimension) {
  const scale = maxDimension ? Math.min(1, maxDimension / Math.max(width, height)) : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Logo width as a percentage of the image width for a given "size" option (10–200). */
export function logoWidthPercent(size) {
  return Math.round(bounded(size, 10, 200, 60) * 0.2 * 10) / 10;
}

/**
 * Where to draw the logo. Pure so it can be unit-tested.
 * @returns {{ width: number, height: number, alpha: number, positions: Array<{ x: number, y: number }> }}
 */
export function computeLogoPlacement(canvasWidth, canvasHeight, logoWidth, logoHeight, options = {}) {
  const size = bounded(options.size, 10, 200, 60);
  const ratio = logoHeight / logoWidth;
  const width = Math.max(1, Math.min(canvasWidth * 0.2 * size / 100, canvasHeight * 0.96 / ratio));
  const height = Math.max(1, width * ratio);
  const alpha = bounded(options.opacity, 0, 100, 60) / 100;

  if (options.tiled) {
    const gapX = Math.max(width * 1.5, canvasWidth / 100);
    const gapY = Math.max(height * 1.5, canvasHeight / 100);
    const positions = [];

    for (let row = 0; row * gapY < canvasHeight && positions.length < MAX_TILES; row += 1) {
      for (let col = 0; col * gapX < canvasWidth + gapX && positions.length < MAX_TILES; col += 1) {
        positions.push({ x: col * gapX - (row % 2 ? gapX / 2 : 0), y: row * gapY });
      }
    }

    return { width, height, alpha, positions };
  }

  const position = LOGO_POSITIONS.includes(options.logoPosition) ? options.logoPosition : 'center';
  const pad = Math.min(canvasWidth, canvasHeight) * bounded(options.margin, 0, 20, 2) / 100;
  const x = position.includes('left') ? pad : position.includes('right') ? canvasWidth - width - pad : (canvasWidth - width) / 2;
  const y = position.startsWith('top') ? pad : position.startsWith('bottom') ? canvasHeight - height - pad : (canvasHeight - height) / 2;

  return { width, height, alpha, positions: [{ x, y }] };
}

/**
 * Draws source + logo onto a 2D context of size (width, height).
 * Works with CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D.
 */
export function drawWatermark(ctx, source, logo, options, width, height) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  if (!logo) return;

  const logoWidth = logo.width || logo.naturalWidth;
  const logoHeight = logo.height || logo.naturalHeight;
  if (!logoWidth || !logoHeight) return;

  const placement = computeLogoPlacement(width, height, logoWidth, logoHeight, options);
  ctx.globalAlpha = placement.alpha;
  for (const { x, y } of placement.positions) {
    ctx.drawImage(logo, x, y, placement.width, placement.height);
  }
  ctx.globalAlpha = 1;
}

/** Fits the source into (width, height) with white letterboxing, preserving aspect ratio. */
export function drawLetterboxed(ctx, source, width, height) {
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}
