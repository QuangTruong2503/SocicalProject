import { useEffect, useRef, useState } from 'react';
import { generateThumbnails } from '../../utils/imageThumbnail.js';
import '../../styles/ImageUploader.css';

let nextImageId = 0;

function reorderImages(list, fromIndex, toIndex) {
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function fileKey(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function releaseImage(image) {
  URL.revokeObjectURL(image.preview);
  if (image.thumb) URL.revokeObjectURL(image.thumb);
}

/**
 * Source image picker. Each image is
 * { id, file, name, preview, thumb, status: 'loading' | 'ready' | 'error' };
 * status 'error' means this browser cannot decode the file (e.g. HEIC outside Safari).
 */
export default function ImageUploader({ images, onImagesChange, onImagePreview }) {
  const fileRef = useRef();
  const dragDepthRef = useRef(0);
  const imagesRef = useRef(images);
  const generationRef = useRef(0);
  const openRefs = useRef(new Map());
  const [notice, setNotice] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const unreadableCount = images.filter((image) => image.status === 'error').length;

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => () => {
    generationRef.current += 1;
    imagesRef.current.forEach(releaseImage);
  }, []);

  function updateImage(id, patch, onMissing) {
    onImagesChange((current) => {
      const index = current.findIndex((image) => image.id === id);
      if (index === -1) {
        onMissing?.();
        return current;
      }
      const next = [...current];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addFiles(fileList) {
    const files = Array.from(fileList);
    const imageFiles = files.filter((file) => file.size > 0 && (file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)));
    const existing = new Set(imagesRef.current.map((image) => fileKey(image.file)));
    const fresh = imageFiles.filter((file) => !existing.has(fileKey(file)));
    const skippedNonImages = files.length - imageFiles.length;
    const skippedDuplicates = imageFiles.length - fresh.length;

    setNotice([
      skippedNonImages ? `Đã bỏ qua ${skippedNonImages} file trống hoặc không phải ảnh.` : '',
      skippedDuplicates ? `${skippedDuplicates} ảnh đã có trong danh sách.` : '',
    ].filter(Boolean).join(' '));

    if (!fresh.length) return;

    const added = fresh.map((file) => ({
      id: `img-${(nextImageId += 1)}`,
      file,
      name: file.name,
      preview: URL.createObjectURL(file),
      thumb: null,
      status: 'loading',
    }));

    onImagesChange((current) => [...current, ...added]);

    const generation = generationRef.current;
    generateThumbnails(fresh, {
      concurrency: 2,
      shouldContinue: () => generationRef.current === generation,
      onThumbnailReady: (index, thumbUrl) => {
        updateImage(added[index].id, { thumb: thumbUrl, status: 'ready' }, () => URL.revokeObjectURL(thumbUrl));
      },
      onThumbnailError: (index) => {
        updateImage(added[index].id, { status: 'error' });
      },
    });
  }

  function clearAll() {
    generationRef.current += 1;
    imagesRef.current.forEach(releaseImage);
    onImagesChange([]);
    setNotice('');
  }

  function removeImage(id) {
    const removed = images.find((image) => image.id === id);
    if (removed) releaseImage(removed);
    onImagesChange((current) => current.filter((image) => image.id !== id));
  }

  function removeUnreadable() {
    images.filter((image) => image.status === 'error').forEach(releaseImage);
    onImagesChange((current) => current.filter((image) => image.status !== 'error'));
  }

  function moveImage(index, target) {
    if (target < 0 || target >= images.length) return;
    const { id } = images[index];
    onImagesChange((current) => reorderImages(current, index, target));
    // Keep keyboard focus on the moved image.
    requestAnimationFrame(() => openRefs.current.get(id)?.focus());
  }

  const handleDrop = (event) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    addFiles(event.dataTransfer.files);
  };

  const isFileDrag = (event) => Array.from(event.dataTransfer.types || []).includes('Files');

  const openSourcePreview = (index) => onImagePreview?.({
    gallery: images.map((image, imageIndex) => ({
      url: image.preview,
      title: image.name,
      kicker: `Ảnh nguồn #${imageIndex + 1}`,
      downloadName: image.name,
    })),
    index,
  });

  return (
    <div className="wm-image-uploader">
      <div className="wm-source-heading">
        <div className="wm-section-label">
          <span className="wm-inline-icon" aria-hidden="true">▣</span>
          Ảnh nguồn
          {images.length > 0 && <span className="wm-badge">{images.length}</span>}
        </div>
        {images.length > 0 && (
          <button
            className="wm-source-detail-button"
            type="button"
            onClick={() => onImagePreview?.({
              title: `${images.length} ảnh nguồn`,
              kicker: 'Toàn cảnh ảnh đã chọn',
              items: images.map((image, index) => ({ url: image.preview, title: image.name, index: index + 1 })),
            })}
          >
            <span aria-hidden="true">⌕</span>
            Xem chi tiết
          </button>
        )}
      </div>

      <button
        type="button"
        className={`wm-dropzone${isDraggingFiles ? ' is-dragging' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!isFileDrag(event)) return;
          dragDepthRef.current += 1;
          setIsDraggingFiles(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (isFileDrag(event)) setIsDraggingFiles(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsDraggingFiles(false);
        }}
        onDrop={handleDrop}
      >
        <span className="wm-dropzone-icon" aria-hidden="true">⇧</span>
        <span className="wm-dropzone-title">{images.length ? 'Thêm ảnh' : 'Kéo thả hoặc bấm để chọn ảnh'}</span>
        <small className="wm-muted-text">JPG, PNG, WebP – chọn nhiều file cùng lúc. Ảnh rất lớn được thu về cạnh dài 4096px.</small>
      </button>

      {notice && <p role="status" className="wm-muted-text">{notice}</p>}

      {unreadableCount > 0 && (
        <div className="wm-inline-banner wm-inline-banner--error" role="alert">
          <span className="wm-inline-icon" aria-hidden="true">!</span>
          <span>
            {unreadableCount} ảnh không đọc được trên trình duyệt này (thường là ảnh HEIC từ iPhone) và sẽ bị bỏ qua.
            Hãy chuyển sang JPG rồi chọn lại.
          </span>
          <button type="button" className="wm-btn-outline wm-btn-small" onClick={removeUnreadable}>Bỏ các ảnh này</button>
        </div>
      )}

      {images.length > 0 && (
        <div className="wm-source-toolbar">
          <p className="wm-muted-text">Kéo ảnh hoặc dùng Alt + ← / → để đổi thứ tự.</p>
          <button type="button" className="wm-btn-danger-ghost wm-btn-small" onClick={clearAll}>Xóa tất cả</button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {images.length > 0 && (
        <ul className="wm-thumb-grid">
          {images.map((image, index) => (
            <li
              key={image.id}
              className={`wm-thumb${image.status === 'error' ? ' is-unreadable' : ''}${draggedIndex === index ? ' is-dragging' : ''}${dropIndex === index && draggedIndex !== index ? ' is-drop-target' : ''}`}
              draggable
              onDragStart={(event) => {
                setDraggedIndex(index);
                setDropIndex(index);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', image.id);
              }}
              onDragEnd={() => { setDraggedIndex(null); setDropIndex(null); }}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggedIndex !== null && draggedIndex !== index) setDropIndex(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedIndex !== null && draggedIndex !== index) {
                  onImagesChange((current) => reorderImages(current, draggedIndex, index));
                }
                setDraggedIndex(null);
                setDropIndex(null);
              }}
            >
              <button
                ref={(element) => {
                  if (element) openRefs.current.set(image.id, element);
                  else openRefs.current.delete(image.id);
                }}
                type="button"
                className="wm-thumb-open"
                onClick={() => openSourcePreview(index)}
                onKeyDown={(event) => {
                  if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                    event.preventDefault();
                    moveImage(index, index + (event.key === 'ArrowLeft' ? -1 : 1));
                  }
                }}
                aria-label={`${image.name}, ảnh số ${index + 1}${image.status === 'error' ? ', không đọc được' : ''}. Bấm để phóng to`}
              >
                {image.status === 'ready' && <img src={image.thumb} alt="" loading="lazy" decoding="async" />}
                {image.status === 'loading' && (
                  <span className="wm-thumb-loading" aria-hidden="true"><span className="wm-thumb-loading-spinner" /></span>
                )}
                {image.status === 'error' && (
                  <span className="wm-thumb-error" aria-hidden="true">
                    <strong>!</strong>
                    <small>Không đọc được</small>
                  </span>
                )}
              </button>
              <span className="wm-thumb-order-badge" aria-hidden="true">{index + 1}</span>
              <button className="wm-thumb-remove" aria-label={`Xóa ảnh ${image.name}`} type="button" onClick={() => removeImage(image.id)}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
