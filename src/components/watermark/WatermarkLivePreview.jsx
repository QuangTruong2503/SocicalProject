import { useEffect, useRef, useState } from 'react';
import { createThumbnailBlob } from '../../utils/imageThumbnail.js';

const PREVIEW_SOURCE_DIMENSION = 1080;
const PREVIEW_OUTPUT_DIMENSION = 720;

/**
 * Live preview of the current settings on one chosen source image.
 * The full-size source is decoded once into a small copy (cached per image), so
 * moving a slider only re-renders that small copy.
 *
 * @param {{
 *   images: Array<{ id: string, file: File, name: string }>, engine: ReturnType<typeof import('../../utils/watermarkEngine.js').createWatermarkEngine>,
 *   options: Record<string, unknown>, logoVersion: number, paused: boolean,
 * }} props
 */
export default function WatermarkLivePreview({ images, engine, options, logoVersion, paused }) {
  const [selectedId, setSelectedId] = useState(null);
  const [preview, setPreview] = useState(null);
  const sourceCacheRef = useRef(new Map());
  const { size, opacity, tiled, logoPosition, margin } = options;

  const selectedIndex = Math.max(0, images.findIndex((image) => image.id === selectedId));
  const selected = images[selectedIndex];
  const renderKey = selected ? JSON.stringify([selected.id, size, opacity, tiled, logoPosition, margin, logoVersion]) : '';

  // Forget cached small copies of images that were removed.
  useEffect(() => {
    const ids = new Set(images.map((image) => image.id));
    sourceCacheRef.current.forEach((_, id) => {
      if (!ids.has(id)) sourceCacheRef.current.delete(id);
    });
  }, [images]);

  useEffect(() => {
    if (!selected || paused || !engine) return undefined;

    let active = true;
    let url = null;
    const timer = setTimeout(async () => {
      try {
        let source = sourceCacheRef.current.get(selected.id);
        if (!source) {
          source = await createThumbnailBlob(selected.file, PREVIEW_SOURCE_DIMENSION, 0.9);
          sourceCacheRef.current.set(selected.id, source);
        }
        const { blob } = await engine.render(
          source,
          { size, opacity, tiled, logoPosition, margin },
          { maxDimension: PREVIEW_OUTPUT_DIMENSION },
        );
        if (!active) return;
        url = URL.createObjectURL(blob);
        setPreview({ key: renderKey, url });
      } catch {
        if (active) setPreview({ key: renderKey, error: true });
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
      if (url) {
        URL.revokeObjectURL(url);
        // Drop the revoked URL too: after a pause the key is unchanged and the
        // stale entry would otherwise be rendered as a broken image.
        const revoked = url;
        setPreview((current) => (current?.url === revoked ? null : current));
      }
    };
    // renderKey captures every input that changes the picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey, paused, engine]);

  if (!images.length) return null;

  const ready = preview?.key === renderKey;

  return (
    <section className="wm-live-preview" aria-label="Xem trước watermark">
      <div className="wm-control-row">
        <strong>Xem trước</strong>
        {images.length > 1 ? (
          <div className="wm-preview-picker">
            <button
              type="button"
              onClick={() => setSelectedId(images[(selectedIndex - 1 + images.length) % images.length].id)}
              aria-label="Ảnh trước"
            >
              ‹
            </button>
            <span aria-live="polite">Ảnh {selectedIndex + 1}/{images.length}</span>
            <button
              type="button"
              onClick={() => setSelectedId(images[(selectedIndex + 1) % images.length].id)}
              aria-label="Ảnh sau"
            >
              ›
            </button>
          </div>
        ) : (
          <small>Bản thu nhỏ</small>
        )}
      </div>
      <div className="wm-live-preview-frame">
        {paused ? (
          <span className="wm-muted-text">Đang tạo ảnh đầy đủ…</span>
        ) : ready && preview.error ? (
          <span role="status">Không thể xem trước ảnh này. Ảnh có thể không đọc được trên trình duyệt này.</span>
        ) : ready ? (
          <img src={preview.url} alt={`Xem trước ${selected.name} với cài đặt hiện tại`} />
        ) : (
          <span className="wm-muted-text">Đang chuẩn bị xem trước…</span>
        )}
      </div>
    </section>
  );
}
