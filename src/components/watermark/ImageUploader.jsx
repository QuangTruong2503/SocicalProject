import React, { useRef } from 'react';
import '../../styles/ImageUploader.css';

export default function ImageUploader({ images, onImagesChange, onImagePreview }) {
  const fileRef = useRef();

  const handleFiles = (e) => {
    const files = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const previews = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }));
    onImagesChange(previews);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const previews = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }));
    onImagesChange(previews);
  };

  const removeImage = (idx) => {
    onImagesChange((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="wm-image-uploader">
      <div className="wm-section-label">
        <span className="wm-inline-icon" aria-hidden="true">▣</span>
        Ảnh nguồn
        {images.length > 0 && (
          <span className="wm-badge">{images.length}</span>
        )}
      </div>

      <div
        className="wm-dropzone"
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <span className="wm-dropzone-icon" aria-hidden="true">⇧</span>
        <p className="wm-dropzone-title">Kéo thả hoặc click để chọn ảnh</p>
        <small className="wm-muted-text">Hỗ trợ JPG, PNG, WebP – nhiều file cùng lúc</small>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFiles}
      />

      {images.length > 0 && (
        <div className="wm-thumb-grid">
          {images.map((img, i) => (
            <div
              key={i}
              className="wm-thumb wm-zoom-trigger"
              role="button"
              tabIndex={0}
              onClick={() => onImagePreview?.({
                url: img.preview,
                title: img.name,
                kicker: `Ảnh nguồn #${i + 1}`,
              })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onImagePreview?.({
                    url: img.preview,
                    title: img.name,
                    kicker: `Ảnh nguồn #${i + 1}`,
                  });
                }
              }}
              aria-label={`Phóng to ${img.name}`}
            >
              <img src={img.preview} alt={img.name} />
              <button
                className="wm-thumb-remove"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(i);
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
