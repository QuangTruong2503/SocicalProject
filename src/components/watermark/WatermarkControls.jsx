import React from 'react';

export default function WatermarkControls({ options, onChange }) {
  const { size, opacity, tiled, productName, logoPosition } = options;

  const update = (key, value) => onChange({ ...options, [key]: value });

  return (
    <div className="wm-controls">
      {/* Product Name */}
      <div className="wm-control-group">
        <div className="wm-section-label">
          <i className="bi bi-tag me-2" />
          Tên sản phẩm
        </div>
        <input
          type="text"
          className="wm-input"
          placeholder="Ví dụ: ao-thun-mau-den"
          value={productName}
          onChange={(e) => update('productName', e.target.value)}
        />
        <small className="text-muted">
          Nhiều ảnh sẽ được đặt tên: <code>{productName || 'image'}_01.jpg</code>,{' '}
          <code>{productName || 'image'}_02.jpg</code>…
        </small>
      </div>

      {/* Logo Size */}
      <div className="wm-control-group">
        <div className="wm-control-row">
          <div className="wm-section-label mb-0">
            <i className="bi bi-aspect-ratio me-2" />
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
          <div className="wm-section-label mb-0">
            <i className="bi bi-droplet-half me-2" />
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
          <div className="wm-section-label mb-0">
            <i className="bi bi-grid-3x3 me-2" />
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
        <small className="text-muted mt-1 d-block">
          {tiled
            ? 'Logo được lặp đều trên toàn bộ ảnh'
            : 'Logo đặt ở vị trí đã chọn'}
        </small>
      </div>

      {/* Logo Position - Show only when not tiled */}
      {!tiled && (
        <div className="wm-control-group">
          <div className="wm-section-label">
            <i className="bi bi-pin-map me-2" />
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