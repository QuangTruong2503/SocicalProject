import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ensureHexColor } from '../../utils/colorTools.js';
import '../../styles/WatermarkControls.css';

const ACCENT_COLOR_PRESETS = [
  { label: 'Xanh', value: '#2563EB' },
  { label: 'Tím', value: '#7C3AED' },
  { label: 'Cam', value: '#F97316' },
  { label: 'Hồng', value: '#DB2777' },
  { label: 'Teal', value: '#0F766E' },
  { label: 'Lime', value: '#65A30D' },
];

function normalizeHexInput(value, fallback) {
  const next = String(value || '').trim();
  if (!next) return fallback;
  if (/^#?[0-9a-fA-F]{3}$/.test(next) || /^#?[0-9a-fA-F]{6}$/.test(next)) {
    return ensureHexColor(next, fallback);
  }
  return fallback;
}

function AccentColorModal({
  isOpen,
  value,
  onApply,
  onClose,
}) {
  const normalizedValue = ensureHexColor(value, '#2563EB');
  const [draftColor, setDraftColor] = useState(normalizedValue);
  const [draftInput, setDraftInput] = useState(normalizedValue);

  useEffect(() => {
    if (!isOpen) return undefined;

    const nextValue = ensureHexColor(value, '#2563EB');
    setDraftColor(nextValue);
    setDraftInput(nextValue);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.classList.add('wm-modal-open');
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('wm-modal-open');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, value]);

  const handlePresetClick = (presetValue) => {
    const nextValue = ensureHexColor(presetValue, '#2563EB');
    setDraftColor(nextValue);
    setDraftInput(nextValue);
  };

  const handleColorInput = (event) => {
    const nextValue = ensureHexColor(event.target.value, draftColor);
    setDraftColor(nextValue);
    setDraftInput(nextValue);
  };

  const handleHexInput = (event) => {
    const rawValue = event.target.value;
    setDraftInput(rawValue);

    const normalized = normalizeHexInput(rawValue, draftColor);
    if (normalized) {
      setDraftColor(normalized);
    }
  };

  const handleSave = () => {
    const nextValue = normalizeHexInput(draftInput, draftColor);
    onApply(nextValue);
  };

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="wm-modal-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        className="wm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wm-accent-modal-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="wm-modal__header">
          <div>
            <span className="wm-modal__kicker">Color studio</span>
            <h3 id="wm-accent-modal-title">Chọn màu giao diện</h3>
            <p>Chọn nhanh một màu có sẵn hoặc tạo màu riêng rồi áp dụng ngay.</p>
          </div>

          <button
            className="wm-modal__close"
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp chọn màu giao diện"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="wm-modal__body">
          <section className="wm-modal__preview">
            <div
              className="wm-modal__swatch"
              style={{ '--wm-preview-color': draftColor }}
              aria-hidden="true"
            />
            <div className="wm-modal__preview-copy">
              <strong>{draftColor}</strong>
              <span>Đây là màu đang được chọn cho giao diện.</span>
            </div>
          </section>

          <section className="wm-modal__section">
            <div className="wm-modal__section-head">
              <h4>Màu có sẵn</h4>
              <span>Chọn nhanh</span>
            </div>

            <div className="wm-modal__palette" role="list" aria-label="Preset màu giao diện">
              {ACCENT_COLOR_PRESETS.map((preset) => {
                const active = draftColor === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    className={`wm-palette-chip${active ? ' is-active' : ''}`}
                    onClick={() => handlePresetClick(preset.value)}
                    style={{ '--wm-swatch': preset.value }}
                  >
                    <span className="wm-palette-chip__dot" aria-hidden="true" />
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="wm-modal__section">
            <div className="wm-modal__section-head">
              <h4>Tạo màu riêng</h4>
              <span>Tùy chỉnh</span>
            </div>

            <div className="wm-modal__creator">
              <label className="wm-modal__color-field">
                <span>Chọn màu trực tiếp</span>
                <input
                  type="color"
                  className="wm-modal__color-input"
                  value={draftColor}
                  onChange={handleColorInput}
                  aria-label="Chọn màu trực tiếp"
                />
              </label>

              <label className="wm-modal__hex-field">
                <span>Nhập mã màu</span>
                <input
                  type="text"
                  className="wm-input wm-modal__hex-input"
                  value={draftInput}
                  onChange={handleHexInput}
                  onBlur={() => {
                    const normalized = normalizeHexInput(draftInput, draftColor);
                    setDraftColor(normalized);
                    setDraftInput(normalized);
                  }}
                  placeholder="#2563EB"
                  spellCheck="false"
                  inputMode="text"
                />
              </label>
            </div>
          </section>
        </div>

        <footer className="wm-modal__footer">
          <button className="wm-modal__button wm-modal__button--ghost" type="button" onClick={onClose}>
            Hủy
          </button>
          <button className="wm-modal__button wm-modal__button--primary" type="button" onClick={handleSave}>
            Áp dụng màu
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default function WatermarkControls({
  options,
  onChange,
  enableAccentOptions = false,
}) {
  const {
    size = 60,
    opacity = 60,
    tiled = false,
    productName = '',
    logoPosition = 'center',
    accentColor = '#2563EB',
  } = options || {};

  const update = (key, value) => onChange({ ...(options || {}), [key]: value });
  const currentAccentColor = useMemo(() => ensureHexColor(accentColor, '#2563EB'), [accentColor]);
  const [isAccentModalOpen, setIsAccentModalOpen] = useState(false);

  return (
    <div className="wm-controls">
      {enableAccentOptions && (
        <div className="wm-control-group wm-control-group--accent">
          <div className="wm-control-row">
          </div>

          <button
            type="button"
            className="wm-accent-launcher"
            onClick={() => setIsAccentModalOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isAccentModalOpen}
          >
            <span
              className="wm-accent-launcher__swatch"
              aria-hidden="true"
              style={{ '--wm-swatch': currentAccentColor }}
            />
            <span className="wm-accent-launcher__text">
              <strong>Chọn màu giao diện</strong>
              <small>{currentAccentColor}</small>
            </span>
            <span className="wm-accent-launcher__icon" aria-hidden="true">⌄</span>
          </button>

          <small className="wm-muted-text wm-block-text">
            Màu này áp dụng cho toàn bộ giao diện trang watermark.
          </small>

          <AccentColorModal
            isOpen={isAccentModalOpen}
            value={currentAccentColor}
            onApply={(nextColor) => {
              update('accentColor', nextColor);
              setIsAccentModalOpen(false);
            }}
            onClose={() => setIsAccentModalOpen(false)}
          />
        </div>
      )}

      {/* Product Name */}
      <div className="wm-control-group">
        <div className="wm-section-label">
          <span className="wm-inline-icon" aria-hidden="true">#</span>
          Tên sản phẩm
        </div>
        <input
          type="text"
          className="wm-input"
          placeholder="Ví dụ: ao-thun-mau-den"
          value={productName}
          onChange={(e) => update('productName', e.target.value)}
        />
        <small className="wm-muted-text">
          Nhiều ảnh sẽ được đặt tên: <code>{productName || 'image'}_01.jpg</code>,{' '}
          <code>{productName || 'image'}_02.jpg</code>…
        </small>
      </div>

      {/* Logo Size */}
      <div className="wm-control-group">
        <div className="wm-control-row">
          <div className="wm-section-label wm-section-label--compact">
            <span className="wm-inline-icon" aria-hidden="true">▭</span>
            Kích thước logo
          </div>
          <span className="wm-value-badge">{size}%</span>
        </div>
        <input
          type="range"
          className="wm-slider"
          min={10}
          max={200}
          value={size}
          onChange={(e) => update('size', Number(e.target.value))}
        />
        <div className="wm-slider-labels">
          <span>Nhỏ</span>
          <span>Lớn</span>
        </div>
      </div>

      {/* Opacity */}
      <div className="wm-control-group">
        <div className="wm-control-row">
          <div className="wm-section-label wm-section-label--compact">
            <span className="wm-inline-icon" aria-hidden="true">◐</span>
            Độ mờ
          </div>
          <span className="wm-value-badge">{opacity}%</span>
        </div>
        <input
          type="range"
          className="wm-slider"
          min={5}
          max={100}
          value={opacity}
          onChange={(e) => update('opacity', Number(e.target.value))}
        />
        <div className="wm-slider-labels">
          <span>Mờ</span>
          <span>Rõ</span>
        </div>
      </div>

      {/* Tiled Toggle */}
      <div className="wm-control-group">
        <label className="wm-toggle-label">
          <div className="wm-section-label wm-section-label--compact">
            <span className="wm-inline-icon" aria-hidden="true">▦</span>
            Lặp lại watermark
          </div>
          <div className="wm-toggle-wrap">
            <input
              type="checkbox"
              className="wm-toggle-input"
              id="tiledToggle"
              checked={tiled}
              onChange={(e) => update('tiled', e.target.checked)}
            />
            <span className="wm-toggle" />
          </div>
        </label>
        <small className="wm-muted-text wm-block-text">
          {tiled
            ? 'Logo được lặp đều trên toàn bộ ảnh'
            : 'Logo đặt ở vị trí đã chọn'}
        </small>
      </div>

      {/* Logo Position - Show only when not tiled */}
      {!tiled && (
        <div className="wm-control-group">
          <div className="wm-section-label">
            <span className="wm-inline-icon" aria-hidden="true">⌖</span>
            Vị trí logo
          </div>
          <select
            className="wm-input"
            value={logoPosition}
            onChange={(e) => update('logoPosition', e.target.value)}
          >
            <option value="top-left">⬉ Trên trái</option>
            <option value="top-center">⬆ Trên giữa</option>
            <option value="top-right">⬈ Trên phải</option>
            <option value="center-left">⬅ Giữa trái</option>
            <option value="center">● Giữa</option>
            <option value="center-right">➡ Giữa phải</option>
            <option value="bottom-left">⬋ Dưới trái</option>
            <option value="bottom-center">⬇ Dưới giữa</option>
            <option value="bottom-right">⬊ Dưới phải</option>
          </select>
        </div>
      )}
    </div>
  );
}
