/**
 * useWatermarkProcessor
 * Core logic: renders each source image with the logo watermark onto a canvas,
 * then exports as JPEG blob.
 */
import imageCompression from 'browser-image-compression';

export async function processWatermark(sourceFile, logoUrl, options = {}) {
  const {
    size = 60,
    opacity = 60,
    tiled = false,
    logoPosition = 'bottom-right',
  } = options;

  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(sourceFile);
    const img = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(sourceUrl);
    };

    img.onload = () => {
      const logo = new Image();
      logo.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0);

        const scaleFactor = size / 100;
        const logoW = Math.round(img.naturalWidth * 0.2 * scaleFactor);
        const logoH = Math.round((logo.naturalHeight / logo.naturalWidth) * logoW);

        ctx.globalAlpha = opacity / 100;

        if (tiled) {
          const gapX = logoW * 1.5;
          const gapY = logoH * 1.5;
          const cols = Math.ceil(canvas.width / gapX) + 1;
          const rows = Math.ceil(canvas.height / gapY) + 1;

          for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
              const x = c * gapX - (r % 2 === 0 ? 0 : gapX / 2);
              const y = r * gapY;
              ctx.drawImage(logo, x, y, logoW, logoH);
            }
          }
        } else {
          const pad = Math.round(img.naturalWidth * 0.02);
          let x = 0;
          let y = 0;

          if (logoPosition.includes('left')) {
            x = pad;
          } else if (logoPosition.includes('right')) {
            x = canvas.width - logoW - pad;
          } else {
            x = (canvas.width - logoW) / 2;
          }

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
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob failed'));
          },
          'image/jpeg',
          0.92
        );
      };

      logo.onerror = () => {
        cleanup();
        reject(new Error('Logo load error'));
      };

      logo.src = logoUrl;
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('Image load error'));
    };

    img.src = sourceUrl;
  });
}

/**
 * Resize a JPEG blob to 800×600 (letterboxed with black bars)
 */
export async function resizeBlob(blob, width = 800, height = 600) {
  const url = URL.createObjectURL(blob);
  
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        // Clean up the object URL as soon as the image is loaded
        URL.revokeObjectURL(url);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Calculate aspect ratio (Contain)
        const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        const dx = (width - dw) / 2;
        const dy = (height - dh) / 2;

        ctx.drawImage(img, dx, dy, dw, dh);

        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Canvas to Blob failed'))),
          'image/jpeg',
          0.9
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Image load error'));
      };

      img.src = url;
    });
  } catch (error) {
    URL.revokeObjectURL(url); // Safety fallback
    throw error;
  }
}

export function buildFileName(baseName, index, total) {
  const safeName = baseName.trim() || 'image';
  if (total === 1) return `${safeName}.jpg`;
  return `${safeName}_${String(index + 1).padStart(2, '0')}.jpg`;
}

/**
 * Resize and compress a JPEG blob to 800×600 and under 100KB
 * Uses browser-image-compression for efficient compression
 */
export async function compressAndResizeBlob(blob, width = 800, height = 600, maxSizeKB = 100) {
  try {
    // First, resize to 800x600
    const resizedBlob = await resizeBlob(blob, width, height);
    
    // Then compress to under maxSizeKB
    const options = {
      maxSizeMB: maxSizeKB / 1024, // Convert KB to MB
      maxWidthOrHeight: Math.max(width, height),
      useWebWorker: true,
      quality: 0.8,
    };
    
    const compressedBlob = await imageCompression(resizedBlob, options);
    return compressedBlob;
  } catch (err) {
    console.error('Compression error:', err);
    // Fallback to just resizing if compression fails
    return resizeBlob(blob, width, height);
  }
}
