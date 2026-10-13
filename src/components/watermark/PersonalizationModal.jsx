import { useRef, useState } from 'react';
import { ensureHexColor } from '../../utils/colorTools.js';
import { DEFAULT_OPTIONS } from '../../utils/watermarkOptions.js';
import WatermarkModal from './WatermarkModal.jsx';
import '../../styles/WatermarkControls.css';

const ACCENT_COLOR_PRESETS = [
  { label: 'Xanh dương', value: '#2563EB' },
  { label: 'Tím', value: '#7C3AED' },
  { label: 'Cam', value: '#F97316' },
  { label: 'Hồng', value: '#DB2777' },
  { label: 'Xanh ngọc', value: '#0F766E' },
  { label: 'Xanh lá', value: '#65A30D' },
];

const SEASONS = [
  { value: 'spring', label: 'Mùa xuân', icon: '🌸', description: 'Hoa rơi nhẹ' },
  { value: 'summer', label: 'Mùa hè', icon: '☀️', description: 'Nắng lấp lánh' },
  { value: 'autumn', label: 'Mùa thu', icon: '🍂', description: 'Lá vàng rơi' },
  { value: 'winter', label: 'Mùa đông', icon: '❄️', description: 'Tuyết rơi' },
];

const TABS = [
  { id: 'color', label: 'Màu giao diện', icon: '🎨' },
  { id: 'season', label: 'Hiệu ứng theo mùa', icon: '✨' },
];

const SEASON_SETTINGS = [
  { key: 'density', label: 'Mật độ', min: 10, max: 80, unit: '%' },
  { key: 'duration', label: 'Tốc độ rơi', min: 5, max: 30, unit: ' giây/lượt' },
  { key: 'opacity', label: 'Độ rõ', min: 10, max: 100, unit: '%' },
];

function normalizeHexInput(value, fallback) {
  const next = String(value || '').trim();
  if (/^#?[0-9a-fA-F]{3}$/.test(next) || /^#?[0-9a-fA-F]{6}$/.test(next)) {
    return ensureHexColor(next, fallback);
  }
  return fallback;
}

/** Page look only (accent color + falling seasonal effect); never affects exported images. */
export default function PersonalizationModal({ options, onApply, onClose }) {
  const initialColor = ensureHexColor(options.accentColor, DEFAULT_OPTIONS.accentColor);
  const [activeTab, setActiveTab] = useState('color');
  const [draftColor, setDraftColor] = useState(initialColor);
  const [draftInput, setDraftInput] = useState(initialColor);
  const [seasonalEffect, setSeasonalEffect] = useState({ ...DEFAULT_OPTIONS.seasonalEffect, ...(options.seasonalEffect || {}) });
  const tabRefs = useRef({});

  function pickColor(value) {
    const next = ensureHexColor(value, draftColor);
    setDraftColor(next);
    setDraftInput(next);
  }

  function handleTabKeyDown(event) {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!offset) return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.id === activeTab);
    const next = TABS[(index + offset + TABS.length) % TABS.length];
    setActiveTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  function handleSave() {
    onApply({ accentColor: normalizeHexInput(draftInput, draftColor), seasonalEffect });
  }

  return (
    <WatermarkModal
      onClose={onClose}
      labelledBy="wm-personalization-modal-title"
      backdropClassName="wm-modal-backdrop"
      className="wm-modal"
      as="section"
    >
      <header className="wm-modal__header">
        <div>
          <span className="wm-modal__kicker">Giao diện</span>
          <h3 id="wm-personalization-modal-title">Cá nhân hóa giao diện</h3>
          <p>Chỉ thay đổi giao diện trang trên trình duyệt này, không ảnh hưởng ảnh xuất ra.</p>
        </div>
        <button className="wm-modal__close" type="button" onClick={onClose} aria-label="Đóng">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="wm-modal__tabs" role="tablist" aria-label="Các tùy chọn cá nhân hóa" onKeyDown={handleTabKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => { tabRefs.current[tab.id] = element; }}
            type="button"
            role="tab"
            id={`wm-personalize-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`wm-personalize-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`wm-modal__tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span aria-hidden="true">{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      <div
        className="wm-modal__body"
        role="tabpanel"
        id={`wm-personalize-panel-${activeTab}`}
        aria-labelledby={`wm-personalize-tab-${activeTab}`}
      >
        {activeTab === 'color' ? (
          <>
            <section className="wm-modal__preview">
              <div className="wm-modal__swatch" style={{ '--wm-preview-color': draftColor }} aria-hidden="true" />
              <div className="wm-modal__preview-copy">
                <strong>{draftColor}</strong>
                <span>Màu đang chọn cho giao diện.</span>
              </div>
            </section>
            <section className="wm-modal__section">
              <div className="wm-modal__section-head">
                <h4>Màu có sẵn</h4>
              </div>
              <div className="wm-modal__palette" role="group" aria-label="Màu có sẵn">
                {ACCENT_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`wm-palette-chip${draftColor === preset.value ? ' is-active' : ''}`}
                    aria-pressed={draftColor === preset.value}
                    onClick={() => pickColor(preset.value)}
                    style={{ '--wm-swatch': preset.value }}
                  >
                    <span className="wm-palette-chip__dot" aria-hidden="true" />
                    {preset.label}
                  </button>
                ))}
              </div>
            </section>
            <section className="wm-modal__section">
              <div className="wm-modal__section-head">
                <h4>Màu riêng</h4>
              </div>
              <div className="wm-modal__creator">
                <label className="wm-modal__color-field">
                  <span>Chọn màu</span>
                  <input type="color" className="wm-modal__color-input" value={draftColor} onChange={(event) => pickColor(event.target.value)} />
                </label>
                <label className="wm-modal__hex-field">
                  <span>Mã màu</span>
                  <input
                    type="text"
                    className="wm-input wm-modal__hex-input"
                    value={draftInput}
                    onChange={(event) => {
                      setDraftInput(event.target.value);
                      setDraftColor(normalizeHexInput(event.target.value, draftColor));
                    }}
                    onBlur={() => pickColor(normalizeHexInput(draftInput, draftColor))}
                    placeholder="#2563EB"
                    spellCheck="false"
                  />
                </label>
              </div>
            </section>
          </>
        ) : (
          <div className="wm-season-panel">
            <label className="wm-season-toggle">
              <span>
                <strong>Hiệu ứng rơi</strong>
                <small>{seasonalEffect.enabled ? 'Đang bật' : 'Đang tắt'} · tự tắt khi hệ thống bật “giảm chuyển động”</small>
              </span>
              <span className="wm-toggle-wrap">
                <input
                  type="checkbox"
                  className="wm-toggle-input"
                  checked={seasonalEffect.enabled}
                  onChange={(event) => setSeasonalEffect((current) => ({ ...current, enabled: event.target.checked }))}
                />
                <span className="wm-toggle" />
              </span>
            </label>
            <section className="wm-modal__section">
              <div className="wm-modal__section-head">
                <h4>Chọn mùa</h4>
              </div>
              <div className="wm-season-grid">
                {SEASONS.map((season) => (
                  <button
                    key={season.value}
                    type="button"
                    className={`wm-season-card${seasonalEffect.season === season.value ? ' is-active' : ''}`}
                    onClick={() => setSeasonalEffect((current) => ({ ...current, season: season.value }))}
                    aria-pressed={seasonalEffect.season === season.value}
                  >
                    <span className="wm-season-card__icon" aria-hidden="true">{season.icon}</span>
                    <span><strong>{season.label}</strong><small>{season.description}</small></span>
                  </button>
                ))}
              </div>
            </section>
            <section className="wm-modal__section wm-season-settings">
              {SEASON_SETTINGS.map((setting) => (
                <label className="wm-season-range" key={setting.key}>
                  <span><strong>{setting.label}</strong><b>{seasonalEffect[setting.key]}{setting.unit}</b></span>
                  <input
                    type="range"
                    className="wm-slider"
                    min={setting.min}
                    max={setting.max}
                    value={seasonalEffect[setting.key]}
                    onChange={(event) => setSeasonalEffect((current) => ({ ...current, [setting.key]: Number(event.target.value) }))}
                  />
                </label>
              ))}
            </section>
          </div>
        )}
      </div>

      <footer className="wm-modal__footer">
        <button className="wm-modal__button wm-modal__button--ghost" type="button" onClick={onClose}>Hủy</button>
        <button className="wm-modal__button wm-modal__button--primary" type="button" onClick={handleSave}>Lưu thay đổi</button>
      </footer>
    </WatermarkModal>
  );
}
