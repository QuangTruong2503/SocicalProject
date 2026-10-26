import { useRef, useState } from 'react';
import { LOGO_POSITIONS, logoWidthPercent } from '../../utils/watermarkRender.js';
import WatermarkModal from './WatermarkModal.jsx';
import '../../styles/WatermarkControls.css';

const POSITION_LABELS = {
  'top-left': 'Trên trái',
  'top-center': 'Trên giữa',
  'top-right': 'Trên phải',
  'center-left': 'Giữa trái',
  center: 'Chính giữa',
  'center-right': 'Giữa phải',
  'bottom-left': 'Dưới trái',
  'bottom-center': 'Dưới giữa',
  'bottom-right': 'Dưới phải',
};

/** 3×3 radio group; arrow keys move between cells. */
function PositionGrid({ value, onChange }) {
  const refs = useRef({});

  function handleKeyDown(event, index) {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = index + moves[event.key];
    if (next < 0 || next >= LOGO_POSITIONS.length) return;
    onChange(LOGO_POSITIONS[next]);
    refs.current[LOGO_POSITIONS[next]]?.focus();
  }

  return (
    <div className="wm-position-grid" role="radiogroup" aria-label="Vị trí logo">
      {LOGO_POSITIONS.map((position, index) => (
        <button
          key={position}
          ref={(element) => { refs.current[position] = element; }}
          type="button"
          role="radio"
          aria-checked={value === position}
          aria-label={POSITION_LABELS[position]}
          title={POSITION_LABELS[position]}
          tabIndex={value === position ? 0 : -1}
          data-dialog-initial={value === position ? true : undefined}
          className={`wm-position-cell${value === position ? ' is-active' : ''}`}
          onClick={() => onChange(position)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          <span aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function RangeControl({ icon, label, value, display, min, max, step = 1, onChange, ends, hint }) {
  return (
    <div className="wm-control-group">
      <div className="wm-control-row">
        <div className="wm-section-label wm-section-label--compact">
          <span className="wm-inline-icon" aria-hidden="true">{icon}</span>
          {label}
        </div>
        <span className="wm-value-badge">{display}</span>
      </div>
      <input
        type="range"
        className="wm-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="wm-slider-labels">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
      {hint && <small className="wm-muted-text wm-block-text">{hint}</small>}
    </div>
  );
}

/** Read-only 3×3 thumbnail of the chosen position, used on the launcher button. */
function PositionMiniMap({ value }) {
  return (
    <span className="wm-position-minimap" aria-hidden="true">
      {LOGO_POSITIONS.map((position) => (
        <span key={position} className={position === value ? 'is-active' : undefined} />
      ))}
    </span>
  );
}

function describePlacement(position, margin) {
  return position === 'center' ? 'Ở chính giữa ảnh' : `Cách lề ${margin}% cạnh ngắn`;
}

/** Position grid + margin in one dialog; changes apply immediately so the live preview follows. */
function PositionModal({ position, margin, onPositionChange, onMarginChange, onClose }) {
  return (
    <WatermarkModal
      onClose={onClose}
      labelledBy="wm-position-modal-title"
      backdropClassName="wm-bulk-rename-backdrop"
      className="wm-bulk-rename-modal wm-position-modal"
    >
      <div className="wm-bulk-rename-header">
        <div className="wm-bulk-rename-heading">
          <span className="wm-bulk-rename-hero-icon" aria-hidden="true">⌖</span>
          <div>
            <span className="wm-bulk-rename-eyebrow">Logo</span>
            <strong id="wm-position-modal-title">Vị trí logo</strong>
            <p>Chọn ô và khoảng cách tới mép ảnh. Ảnh xem trước cập nhật ngay.</p>
          </div>
        </div>
        <button className="wm-bulk-rename-close" type="button" onClick={onClose} aria-label="Đóng">×</button>
      </div>

      <div className="wm-position-modal__body">
        <div className="wm-position-modal__grid">
          <PositionGrid value={position} onChange={onPositionChange} />
          <strong>{POSITION_LABELS[position]}</strong>
        </div>

        <RangeControl
          icon="⇲"
          label="Khoảng cách lề"
          value={margin}
          display={`${margin}%`}
          min={0}
          max={20}
          step={0.5}
          onChange={onMarginChange}
          ends={['Sát mép', 'Xa mép']}
          hint={position === 'center' ? 'Không áp dụng khi logo ở chính giữa.' : 'Tính theo cạnh ngắn của ảnh.'}
        />
      </div>

      <div className="wm-bulk-rename-actions">
        <span />
        <div className="wm-bulk-rename-action-buttons">
          <button className="wm-bulk-rename-confirm" type="button" onClick={onClose}>Xong</button>
        </div>
      </div>
    </WatermarkModal>
  );
}

/** `showFileName={false}` hides the export-name field (/watermark/auto names files from folders + AI). */
export default function WatermarkControls({ options, onChange, showFileName = true }) {
  const { size, opacity, margin, tiled, logoPosition, productName } = options;
  const [isPositionOpen, setIsPositionOpen] = useState(false);
  const update = (key, value) => onChange((current) => ({ ...current, [key]: value }));

  return (
    <div className="wm-controls">
      {showFileName && (
        <label className="wm-control-group wm-block-text">
          <span className="wm-section-label">Tên ảnh xuất</span>
          <input
            className="wm-input"
            type="text"
            value={productName}
            onChange={(event) => update('productName', event.target.value)}
            placeholder="Ví dụ: ao-so-mi"
            maxLength={180}
          />
          <small className="wm-muted-text wm-block-text">Tự thêm số thứ tự và đuôi .jpg. Để trống sẽ dùng tên “image”.</small>
        </label>
      )}

      <RangeControl
        icon="▭"
        label="Kích thước logo"
        value={size}
        display={`${logoWidthPercent(size)}% chiều rộng ảnh`}
        min={10}
        max={200}
        onChange={(value) => update('size', value)}
        ends={['Nhỏ', 'Lớn']}
      />

      <RangeControl
        icon="◐"
        label="Độ rõ của logo"
        value={opacity}
        display={`${opacity}%`}
        min={5}
        max={100}
        onChange={(value) => update('opacity', value)}
        ends={['Mờ', 'Rõ']}
      />

      <div className="wm-control-group">
        <label className="wm-toggle-label">
          <div className="wm-section-label wm-section-label--compact">
            <span className="wm-inline-icon" aria-hidden="true">▦</span>
            Lặp lại logo khắp ảnh
          </div>
          <div className="wm-toggle-wrap">
            <input
              type="checkbox"
              className="wm-toggle-input"
              checked={tiled}
              onChange={(event) => update('tiled', event.target.checked)}
            />
            <span className="wm-toggle" />
          </div>
        </label>
        <small className="wm-muted-text wm-block-text">
          {tiled ? 'Logo được lặp đều trên toàn bộ ảnh.' : 'Logo đặt ở một vị trí bên dưới.'}
        </small>
      </div>

      {!tiled && (
        <div className="wm-control-group">
          <button
            type="button"
            className="wm-position-launcher"
            onClick={() => setIsPositionOpen(true)}
            aria-haspopup="dialog"
          >
            <PositionMiniMap value={logoPosition} />
            <span className="wm-position-launcher__text">
              <span className="wm-section-label wm-section-label--compact">
                <span className="wm-inline-icon" aria-hidden="true">⌖</span>
                Vị trí logo
              </span>
              <strong>{POSITION_LABELS[logoPosition]}</strong>
              <small>{describePlacement(logoPosition, margin)}</small>
            </span>
            <span className="wm-position-launcher__chevron" aria-hidden="true">›</span>
          </button>
        </div>
      )}

      {isPositionOpen && !tiled && (
        <PositionModal
          position={logoPosition}
          margin={margin}
          onPositionChange={(value) => update('logoPosition', value)}
          onMarginChange={(value) => update('margin', value)}
          onClose={() => setIsPositionOpen(false)}
        />
      )}
    </div>
  );
}
