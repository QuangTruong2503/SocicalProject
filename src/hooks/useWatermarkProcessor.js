/** Canvas processing shared by previews and JPEG exports. */
export function loadWatermarkImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => finish(new Error('Đọc ảnh quá thời gian. Hãy thử ảnh khác.')), 30000);
    const finish = (error) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Không thể đọc ảnh. Hãy chọn một ảnh hợp lệ.'));
    image.src = url;
  });
}

function bounded(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

async function exportCanvas(canvas, draw, quality = 0.92) {
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Thiết bị không đủ bộ nhớ để xử lý ảnh này.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    draw(context);
    return await new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Không thể xuất ảnh. Hãy thử ảnh nhỏ hơn.')),
      'image/jpeg', quality,
    ));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function processWatermark(sourceFile, logoUrl, options = {}) {
  const sourceUrl = URL.createObjectURL(sourceFile);
  try {
    const img = await loadWatermarkImage(sourceUrl);
    const logo = logoUrl ? (typeof logoUrl === 'string' ? await loadWatermarkImage(logoUrl) : logoUrl) : null;
    const canvas = document.createElement('canvas');
    const scale = options.maxDimension ? Math.min(1, options.maxDimension / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    return await exportCanvas(canvas, (ctx) => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (!logo) return;
      const size = bounded(options.size, 10, 200, 60);
      const ratio = logo.naturalHeight / logo.naturalWidth;
      const logoW = Math.max(1, Math.min(canvas.width * 0.2 * size / 100, canvas.height * 0.96 / ratio));
      const logoH = Math.max(1, logoW * ratio);
      ctx.globalAlpha = bounded(options.opacity, 0, 100, 60) / 100;
      if (options.tiled) {
        // Bound draw calls for tiny images and extremely wide or short logos.
        const gapX = Math.max(logoW * 1.5, canvas.width / 100);
        const gapY = Math.max(logoH * 1.5, canvas.height / 100);
        for (let row = 0; row * gapY < canvas.height; row += 1) {
          for (let col = 0; col * gapX < canvas.width + gapX; col += 1) {
            ctx.drawImage(logo, col * gapX - (row % 2 ? gapX / 2 : 0), row * gapY, logoW, logoH);
          }
        }
      } else {
        const position = String(options.logoPosition || 'center');
        const pad = Math.min(canvas.width, canvas.height) * 0.02;
        const x = position.includes('left') ? pad : position.includes('right') ? canvas.width - logoW - pad : (canvas.width - logoW) / 2;
        const y = position.includes('top') ? pad : position.includes('bottom') ? canvas.height - logoH - pad : (canvas.height - logoH) / 2;
        ctx.drawImage(logo, x, y, logoW, logoH);
      }
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/** Resize with white letterboxing, preserving the source aspect ratio. */
export async function resizeBlob(blob, width = 800, height = 600) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadWatermarkImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return await exportCanvas(canvas, (ctx) => {
      const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
    }, 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function normalizeImageName(value, fallback = 'image') {
  const base = String(value || '').trim().replace(/\.(jpe?g|png|webp|gif|svg|avif|bmp|heic|tiff?)$/i, '')
    .replace(/[<>:"/\\|?*]/g, '-').replace(/[. ]+$/, '').slice(0, 180);
  return `${base || fallback}.jpg`;
}

export function buildFileName(baseName, index, total) {
  const name = normalizeImageName(baseName).slice(0, -4);
  return total === 1 ? `${name}.jpg` : `${name}_${String(index + 1).padStart(2, '0')}.jpg`;
}

export async function compressAndResizeBlob(blob, width = 800, height = 600, maxSizeKB = 100) {
  const resized = await resizeBlob(blob, width, height);
  const { default: imageCompression } = await import('browser-image-compression');
  const compressed = await imageCompression(resized, {
    maxSizeMB: maxSizeKB / 1024,
    maxWidthOrHeight: Math.max(width, height),
    useWebWorker: true,
    initialQuality: 0.8,
    alwaysKeepResolution: true,
  });
  if (compressed.size > maxSizeKB * 1024) throw new Error('Không thể nén ảnh dưới 100 KB. Hãy chọn chế độ 800 × 600.');
  return compressed;
}
