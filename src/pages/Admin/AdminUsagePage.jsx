import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FaArrowsRotate, FaChartLine, FaClockRotateLeft, FaDroplet, FaSliders, FaWandMagicSparkles } from 'react-icons/fa6';
import { getUsageOverview } from '../../services/adminUsageService.js';
import { FEATURE_LABELS, RANGE_PRESETS, REQUEST_STATUS_LABELS, customRange, presetRange, vnDateKey } from '../../utils/usageDashboard.js';
import { ActivityLog, AiRequestLog } from './AdminUsageLists.jsx';
import AdminUsageConfig from './AdminUsageConfig.jsx';
import AdminUsageOverview from './AdminUsageOverview.jsx';
import AdminUsageWatermark from './AdminUsageWatermark.jsx';
import styles from './Admin.module.css';
import wm from './AdminWatermark.module.css';
import us from './AdminUsage.module.css';

const TABS = [
  { value: 'overview', label: 'Tổng quan', hint: 'Các chỉ số chính', icon: FaChartLine, description: 'Ảnh, hoạt động và chi phí trong khoảng thời gian đã chọn.' },
  { value: 'watermark', label: 'Watermark', hint: 'Ảnh & người dùng', icon: FaDroplet, description: 'Thống kê ảnh đã tạo theo nguồn, trình duyệt và tài khoản.' },
  { value: 'ai', label: 'AI & chi phí', hint: 'Yêu cầu & token', icon: FaWandMagicSparkles, description: 'Theo dõi các lượt đặt tên AI, kết quả và chi phí ước tính.' },
  { value: 'activity', label: 'Nhật ký hoạt động', hint: 'Tạo ảnh, tải & đổi tên', icon: FaClockRotateLeft, description: 'Tra cứu các thao tác tạo ảnh, tải xuống và áp dụng tên AI.' },
  { value: 'config', label: 'Cấu hình & cảnh báo', hint: 'Model, gói & hạn mức', icon: FaSliders, description: 'Quản lý model theo gói, hạn mức sử dụng và ngân sách cảnh báo.' },
];
const EMPTY_FILTERS = { user: '', feature: '', status: '', model: '', keyAlias: '', environment: '' };
const timeFormatter = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' });
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });

export default function AdminUsagePage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(({ value }) => value === params.get('tab')) ? params.get('tab') : 'overview';
  const activeTab = TABS.find(({ value }) => value === tab);
  const rawPreset = params.get('range');
  const preset = rawPreset === 'all' && tab === 'watermark' ? 'all'
    : RANGE_PRESETS.some(({ value }) => value === rawPreset) ? rawPreset : '7d';
  const [reloadToken, setReloadToken] = useState(() => Date.now());
  const customFrom = params.get('from') ?? vnDateKey(new Date(reloadToken - 6 * 86400_000));
  const customTo = params.get('to') ?? vnDateKey(new Date(reloadToken));
  const [filterInput, setFilterInput] = useState({ ai: EMPTY_FILTERS, activity: EMPTY_FILTERS });
  const [filters, setFilters] = useState(filterInput);
  const [overview, setOverview] = useState({ data: null, loading: true, error: '' });
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const requestRef = useRef(0);
  const navRef = useRef(null);
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);
  // Refresh recalculates "today" at the Vietnam day boundary.
  const range = useMemo(() => preset === 'all' ? { from: null, to: null }
    : preset === 'custom' ? customRange(customFrom, customTo) : presetRange(preset, new Date(reloadToken)), [preset, customFrom, customTo, reloadToken]);

  function updateParams(patch, replace = false) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace });
  }
  function setTab(nextTab) {
    updateParams({ tab: nextTab === 'overview' ? null : nextTab, ...(preset === 'all' && nextTab !== 'watermark' ? { range: '30d' } : {}) });
  }
  useEffect(() => {
    const timeout = window.setTimeout(() => setFilters(filterInput), 350);
    return () => window.clearTimeout(timeout);
  }, [filterInput]);

  // The overview is unfiltered. Detailed filters apply only to their own lists.
  useEffect(() => {
    if (range.error || !range.from) return undefined;
    const requestId = ++requestRef.current;
    async function load() {
      setOverview((current) => ({ ...current, loading: true }));
      const result = await getUsageOverview({ from: range.from, to: range.to, filters: {} });
      if (requestId !== requestRef.current) return;
      setOverview((current) => ({ data: result.error ? current.data : result.data, loading: false, error: result.error || '' }));
      if (!result.error) setLastUpdatedAt(new Date());
    }
    load();
    return () => { requestRef.current += 1; };
  }, [range, reloadToken]);

  const input = filterInput[tab] ?? EMPTY_FILTERS;
  const options = overview.data?.options;
  const setFilter = (key) => (event) => setFilterInput((current) => ({ ...current, [tab]: { ...current[tab], [key]: event.target.value } }));
  const refresh = () => setReloadToken(Date.now());
  function openRequestsFor(userId) {
    const next = { ...EMPTY_FILTERS, user: userId };
    setFilterInput((current) => ({ ...current, ai: next }));
    setFilters((current) => ({ ...current, ai: next }));
    setTab('ai');
  }
  const rangeOptions = tab === 'watermark' ? [...RANGE_PRESETS, { value: 'all', label: 'Tất cả lịch sử' }] : RANGE_PRESETS;
  const rangeLabel = rangeOptions.find(({ value }) => value === preset)?.label ?? '';
  const isList = tab === 'activity' || tab === 'ai';

  return (
    <div className={us.workspace}>
      <Helmet><title>Thống kê & sử dụng</title></Helmet>
      <header className={`${styles.pageHeader} ${us.workspaceHeader}`}>
        <div>
          <span className={us.eyebrow}>QUẢN TRỊ HỆ THỐNG</span>
          <h1>Thống kê & sử dụng</h1>
          <p>Watermark, hoạt động và AI — theo dõi tại một nơi.</p>
        </div>
        <div className={styles.headerActions}>
          {lastUpdatedAt && tab !== 'watermark' && <span className={wm.updatedAt}>Cập nhật {timeFormatter.format(lastUpdatedAt)}</span>}
          <button type="button" className={styles.actionButton} onClick={refresh} disabled={tab === 'overview' && overview.loading}>
            <FaArrowsRotate aria-hidden="true" className={tab === 'overview' && overview.loading ? styles.spin : undefined} />Làm mới
          </button>
        </div>
      </header>

      <nav ref={navRef} className={us.workspaceNav} aria-label="Khu vực thống kê">
        {TABS.map((item) => (
          <button key={item.value} type="button" className={`${us.workspaceTab} ${tab === item.value ? us.workspaceTabActive : ''}`}
            aria-current={tab === item.value ? 'page' : undefined} aria-pressed={tab === item.value} onClick={() => setTab(item.value)}>
            <item.icon aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.hint}</small></span>
          </button>
        ))}
      </nav>

      <div className={us.tabIntro}><h2>{activeTab.label}</h2><p>{activeTab.description}</p></div>

      {tab !== 'config' && (
        <section className={us.filterPanel} aria-label="Khoảng thời gian và bộ lọc">
          <div className={us.filterTop}>
            <span className={us.filterLabel}>Khoảng thời gian</span>
            <div className={`${wm.segmented} ${us.rangeSegments}`} role="group" aria-label="Khoảng thời gian">
              {rangeOptions.map(({ value, label }) => (
                <button key={value} type="button" className={`${wm.segment} ${preset === value ? wm.segmentActive : ''}`} aria-pressed={preset === value}
                  onClick={() => updateParams({ range: value })}>{label}</button>
              ))}
            </div>
          </div>
          {preset === 'custom' && <div className={us.dateRange}>
            <label>Từ <input type="date" className={styles.control} value={customFrom} onChange={(event) => updateParams({ from: event.target.value }, true)} /></label>
            <label>Đến <input type="date" className={styles.control} value={customTo} onChange={(event) => updateParams({ to: event.target.value }, true)} /></label>
          </div>}
          {isList && <div className={us.listFilters}>
            <input type="search" className={`${styles.control} ${styles.search}`} value={input.user} onChange={setFilter('user')} placeholder="Tìm theo email hoặc mã tài khoản" aria-label="Lọc theo người dùng" />
            {tab === 'activity' && <select className={styles.control} value={input.feature} onChange={setFilter('feature')} aria-label="Tính năng">
              <option value="">Mọi tính năng</option>{Object.entries(FEATURE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>}
            <select className={styles.control} value={input.status} onChange={setFilter('status')} aria-label="Trạng thái">
              <option value="">Mọi trạng thái</option>{Object.entries(REQUEST_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              {tab === 'activity' && <option value="cancelled">Đã hủy</option>}
            </select>
            {tab === 'ai' && <>
              <select className={styles.control} value={input.model} onChange={setFilter('model')} aria-label="Model">
                <option value="">Mọi model</option>{(options?.models || []).map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
              <details className={us.advancedFilters}>
                <summary>Bộ lọc nâng cao</summary>
                <div className={us.inlineControls}>
                  <select className={styles.control} value={input.keyAlias} onChange={setFilter('keyAlias')} aria-label="Key alias">
                    <option value="">Mọi key</option>{(options?.key_aliases || []).map((alias) => <option key={alias} value={alias}>{alias}</option>)}
                  </select>
                  <select className={styles.control} value={input.environment} onChange={setFilter('environment')} aria-label="Môi trường">
                    <option value="">Mọi môi trường</option>{(options?.environments || []).map((env) => <option key={env} value={env}>{env}</option>)}
                  </select>
                </div>
              </details>
            </>}
            {Object.values(input).some(Boolean) && <button type="button" className={styles.actionButton} onClick={() => {
              setFilterInput((current) => ({ ...current, [tab]: EMPTY_FILTERS })); setFilters((current) => ({ ...current, [tab]: EMPTY_FILTERS }));
            }}>Xóa lọc</button>}
          </div>}
          <p className={us.rangeNote}>{preset === 'all' ? 'Toàn bộ lịch sử ảnh Watermark.' : range.error ? 'Chọn khoảng thời gian hợp lệ để xem số liệu.'
            : `Từ ${dateFormatter.format(new Date(range.from))} đến ${dateFormatter.format(new Date(new Date(range.to).getTime() - 1))}.`} Giờ Việt Nam (UTC+7).</p>
        </section>
      )}

      {range.error && tab !== 'config' && <div className={styles.alert} role="alert">{range.error}</div>}
      {overview.error && tab === 'overview' && <div className={styles.alert} role="alert">
        <span>{overview.error}{overview.data ? ' Đang hiển thị số liệu của lần tải trước.' : ''}</span><button type="button" onClick={refresh}>Thử lại</button>
      </div>}
      {tab === 'overview' && !range.error && (overview.data || overview.loading) && <AdminUsageOverview state={overview} onRefresh={refresh} onOpenRequestsFor={openRequestsFor} onNavigate={setTab} />}
      {tab === 'watermark' && !range.error && <AdminUsageWatermark range={range} rangeLabel={rangeLabel} reloadToken={reloadToken} />}
      {tab === 'activity' && !range.error && <ActivityLog range={range} filters={filters.activity} reloadToken={reloadToken} />}
      {tab === 'ai' && !range.error && <AiRequestLog range={range} filters={filters.ai} reloadToken={reloadToken} />}
      {tab === 'config' && <AdminUsageConfig reloadToken={reloadToken} />}
    </div>
  );
}
