import { useEffect, useState } from 'react';
import { processWatermark } from '../../hooks/useWatermarkProcessor';

export default function WatermarkLivePreview({ file, logoUrl, options, paused }) {
  const [preview, setPreview] = useState(null);
  const { size, opacity, tiled, logoPosition } = options;
  useEffect(() => {
    if (!file || paused) return;
    let active = true;
    let url;
    const timer = setTimeout(async () => {
      try {
        const blob = await processWatermark(file, logoUrl, { size, opacity, tiled, logoPosition, maxDimension: 720 });
        if (!active) return;
        url = URL.createObjectURL(blob);
        setPreview({ url, file, logoUrl, size, opacity, tiled, logoPosition });
      } catch {
        if (active) setPreview({ file, logoUrl, size, opacity, tiled, logoPosition, error: true });
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, logoUrl, size, opacity, tiled, logoPosition, paused]);

  if (!file) return null;
  const ready = preview?.file === file && preview?.logoUrl === logoUrl &&
    preview?.size === size && preview?.opacity === opacity && preview?.tiled === tiled && preview?.logoPosition === logoPosition;
  return (
    <section className="wm-live-preview" aria-label="Xem trước watermark">
      <div className="wm-control-row"><strong>Xem trước</strong><small>Ảnh đầu tiên · Bản thu nhỏ</small></div>
      <div className="wm-live-preview-frame">
        {ready && preview.error ? <span role="status">Không thể xem trước ảnh này. Hãy kiểm tra ảnh nguồn và logo.</span> : ready && !paused ? <img src={preview.url} alt="Ảnh xem trước với cài đặt watermark hiện tại" /> :
          <span className="wm-muted-text">{paused ? 'Đang tạo ảnh đầy đủ…' : 'Đang chuẩn bị xem trước…'}</span>}
      </div>
    </section>
  );
}
