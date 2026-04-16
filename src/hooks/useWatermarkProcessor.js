/**
 * useWatermarkProcessor
 * Core logic: renders each source image with the logo watermark onto a canvas,
 * then exports as JPEG blob.
 */
export async function processWatermark(sourceFile, logoUrl, options) {
  const { size, opacity, tiled, logoPosition = 'bottom-right' } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const logo = new Image();
      logo.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');

        // Draw base image
        ctx.drawImage(img, 0, 0);

        // Compute scaled logo dimensions
        const scaleFactor = size / 100;
        const logoW = Math.round(img.naturalWidth * 0.2 * scaleFactor);
        const logoH = Math.round((logo.naturalHeight / logo.naturalWidth) * logoW);

        ctx.globalAlpha = opacity / 100;

        if (tiled) {
          const gapX = logoW * 1.5;
          const gapY = logoH * 1.5;
          const cols = Math.ceil(canvas.width / gapX) + 1;
          const rows = Math.ceil(canvas.height / gapY) + 1;

          ctx.save();
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const x = c * gapX - (r % 2 === 0 ? 0 : gapX / 2);
              const y = r * gapY;
              ctx.drawImage(logo, x, y, logoW, logoH);
            }
          }
          ctx.restore();
        } else {
          // Draw logo at specified position
          const pad = Math.round(img.naturalWidth * 0.02);
          let x = 0, y = 0;

          // Calculate x position
          if (logoPosition.includes('left')) {
            x = pad;
          } else if (logoPosition.includes('right')) {
            x = canvas.width - logoW - pad;
          } else {
            x = (canvas.width - logoW) / 2;
          }

          // Calculate y position
          if (logoPosition.includes('top')) {
            y = pad;
          } else if (logoPosition.includes('bottom')) {
            y = canvas.height - logoH - pad;
          } else {
            y = (canvas.height - logoH) / 2;
          }

          ctx.drawImage(logo, x, y, logoW, logoH);
        }

        ctx.globalAlpha = 1;

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob failed'));
          },
          'image/jpeg',
          0.92
        );
      };
      logo.onerror = () => reject(new Error('Logo load error'));
      logo.src = logoUrl;
    };
    img.onerror = () => reject(new Error('Image load error'));
    img.src = URL.createObjectURL(sourceFile);
  });
}

/**
 * Resize a JPEG blob to 800×600 (letterboxed with black bars)
 */
export async function resizeBlob(blob, width = 800, height = 600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = (width - dw) / 2;
      const dy = (height - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);

      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('resize failed'))),
        'image/jpeg',
        0.9
      );
    };
    img.onerror = () => reject(new Error('img load error'));
    img.src = URL.createObjectURL(blob);
  });
}

export function buildFileName(baseName, index, total) {
  const safeName = baseName.trim() || 'image';
  if (total === 1) return `${safeName}.jpg`;
  return `${safeName}_${String(index + 1).padStart(2, '0')}.jpg`;
}