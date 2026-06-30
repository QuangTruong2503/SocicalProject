import React, { useMemo, useRef, useState } from 'react';
import '../../styles/ImageUploader.css';

function reorderImages(list, fromIndex, toIndex) {
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  const targetIndex = fromIndex < toIndex ? Math.max(0, toIndex - 1) : toIndex;
  next.splice(targetIndex, 0, moved);
  return next;
}

function getPreviewPositionStyle(logoPosition) {
  switch (logoPosition) {
    case 'top-left':
      return { top: '8%', left: '8%' };
    case 'top-center':
      return { top: '8%', left: '50%', transform: 'translateX(-50%)' };
    case 'top-right':
      return { top: '8%', right: '8%' };
    case 'center-left':
      return { top: '50%', left: '8%', transform: 'translateY(-50%)' };
    case 'center-right':
      return { top: '50%', right: '8%', transform: 'translateY(-50%)' };
    case 'bottom-left':
      return { bottom: '8%', left: '8%' };
    case 'bottom-center':
      return { bottom: '8%', left: '50%', transform: 'translateX(-50%)' };
    case 'bottom-right':
      return { bottom: '8%', right: '8%' };
    case 'center':
    default:
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
}

export default function ImageUploader({
  images,
  onImagesChange,
  onImagePreview,
  logoUrl,
  options,
}) {
  const fileRef = useRef();
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const logoPreviewStyle = useMemo(() => {
    if (!logoUrl) return null;

    const sizeScale = Math.max(0.28, Math.min(1.1, (Number(options?.size) || 60) / 100));
    const opacity = Math.max(0.12, Math.min(1, (Number(options?.opacity) || 60) / 100));
    const baseWidth = options?.tiled ? 24 : 30;
    const width = Math.round(baseWidth + sizeScale * (options?.tiled ? 30 : 52));

    if (options?.tiled) {
      const tileSize = Math.max(20, Math.round(width * 0.85));
      return {
        mode: 'tiled',
        style: {
          backgroundImage: `url(${logoUrl})`,
          backgroundRepeat: 'repeat',
          backgroundSize: `${tileSize}px ${tileSize}px`,
          opacity,
        },
      };
    }

    return {
      mode: 'single',
      width,
      style: {
        width: `${width}px`,
        opacity,
      },
    };
  }, [logoUrl, options?.opacity, options?.size, options?.tiled]);

  const handleFiles = (e) => {
    const files = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    images.forEach((img) => URL.revokeObjectURL(img.preview));
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
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    const previews = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }));
    onImagesChange(previews);
  };

  const removeImage = (idx) => {
    const removed = images[idx];
    if (removed?.preview) {
      URL.revokeObjectURL(removed.preview);
    }
    onImagesChange((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDragStart = (event, index) => {
    setDraggedIndex(index);
    setDropIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropIndex(null);
  };

  const handleDragOverThumb = (event, index) => {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDropIndex(index);
  };

  const handleDropThumb = (event, index) => {
    event.preventDefault();

    const fromIndex = draggedIndex;
    if (fromIndex === null || fromIndex === index) {
      handleDragEnd();
      return;
    }

    onImagesChange((prev) => {
      const currentFrom = Math.min(fromIndex, prev.length - 1);
      const currentTo = Math.min(index, prev.length - 1);
      if (currentFrom === currentTo) return prev;
      return reorderImages(prev, currentFrom, currentTo);
    });

    handleDragEnd();
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
              className={`wm-thumb wm-zoom-trigger${draggedIndex === i ? ' is-dragging' : ''}${dropIndex === i && draggedIndex !== i ? ' is-drop-target' : ''}`}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(event) => handleDragStart(event, i)}
              onDragEnd={handleDragEnd}
              onDragOver={(event) => handleDragOverThumb(event, i)}
              onDrop={(event) => handleDropThumb(event, i)}
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
              {logoPreviewStyle && (
                <div
                  className={`wm-thumb-watermark${logoPreviewStyle.mode === 'tiled' ? ' is-tiled' : ' is-single'}`}
                  aria-hidden="true"
                  style={
                    logoPreviewStyle.mode === 'tiled'
                      ? logoPreviewStyle.style
                      : {
                        ...getPreviewPositionStyle(options?.logoPosition || 'bottom-right'),
                        ...logoPreviewStyle.style,
                      }
                  }
                >
                  {logoPreviewStyle.mode === 'single' && <img src={logoUrl} alt="" draggable={false} />}
                </div>
              )}
              <span className="wm-thumb-order-badge" aria-hidden="true">
                {i + 1}
              </span>
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
