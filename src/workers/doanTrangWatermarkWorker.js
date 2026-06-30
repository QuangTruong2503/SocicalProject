function resolveLogoPosition(canvasWidth, canvasHeight, logoW, logoH, logoPosition) {
  const pad = Math.round(canvasWidth * 0.02);
  let x = 0;
  let y = 0;

  if (logoPosition.includes('left')) {
    x = pad;
  } else if (logoPosition.includes('right')) {
    x = canvasWidth - logoW - pad;
  } else {
    x = (canvasWidth - logoW) / 2;
  }

  if (logoPosition.includes('top')) {
    y = pad;
  } else if (logoPosition.includes('bottom')) {
    y = canvasHeight - logoH - pad;
  } else {
    y = (canvasHeight - logoH) / 2;
  }

  return { x, y };
}

async function drawWatermark({ sourceFile, logoBlob, options }) {
  if (!self.OffscreenCanvas || !self.createImageBitmap) {
    throw new Error('Worker canvas support is unavailable');
  }

  const { size, opacity, tiled, logoPosition = 'bottom-right' } = options;
  const sourceBitmap = await createImageBitmap(sourceFile);
  const logoBitmap = await createImageBitmap(logoBlob);
  const canvas = new OffscreenCanvas(sourceBitmap.width, sourceBitmap.height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    sourceBitmap.close?.();
    logoBitmap.close?.();
    throw new Error('Canvas context unavailable');
  }

  ctx.drawImage(sourceBitmap, 0, 0);

  const scaleFactor = size / 100;
  const logoW = Math.round(sourceBitmap.width * 0.2 * scaleFactor);
  const logoH = Math.round((logoBitmap.height / logoBitmap.width) * logoW);
  ctx.globalAlpha = opacity / 100;

  if (tiled) {
    const gapX = logoW * 1.5;
    const gapY = logoH * 1.5;
    const cols = Math.ceil(canvas.width / gapX) + 1;
    const rows = Math.ceil(canvas.height / gapY) + 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * gapX - (r % 2 === 0 ? 0 : gapX / 2);
        const y = r * gapY;
        ctx.drawImage(logoBitmap, x, y, logoW, logoH);
      }
    }
  } else {
    const { x, y } = resolveLogoPosition(canvas.width, canvas.height, logoW, logoH, logoPosition);
    ctx.drawImage(logoBitmap, x, y, logoW, logoH);
  }

  ctx.globalAlpha = 1;

  const blob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality: 0.92,
  });

  sourceBitmap.close?.();
  logoBitmap.close?.();

  return blob;
}

async function resizeBlobInWorker({ blob, width = 800, height = 600 }) {
  if (!self.OffscreenCanvas || !self.createImageBitmap) {
    throw new Error('Worker canvas support is unavailable');
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    bitmap.close?.();
    throw new Error('Canvas context unavailable');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;

  ctx.drawImage(bitmap, dx, dy, dw, dh);
  bitmap.close?.();

  return canvas.convertToBlob({
    type: 'image/jpeg',
    quality: 0.9,
  });
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};

  try {
    let blob;

    if (type === 'process') {
      blob = await drawWatermark(payload);
    } else if (type === 'resize') {
      blob = await resizeBlobInWorker(payload);
    } else {
      throw new Error(`Unsupported worker action: ${type}`);
    }

    self.postMessage({ id, ok: true, blob });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Worker processing failed',
    });
  }
};
