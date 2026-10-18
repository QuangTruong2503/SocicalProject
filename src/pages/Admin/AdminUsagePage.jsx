import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-toastify';
import { FaArrowsRotate, FaTriangleExclamation } from 'react-icons/fa6';
import { getUsageOverview, sweepStaleUsage } from '../../services/adminUsageService.js';
import {
  ERROR_LABELS,
  FEATURE_LABELS,
  RANGE_PRESETS,
  REQUEST_STATUS_LABELS,
  customRange,
  formatCount,
  formatPercent,
  formatUsd,
  formatVnDateTime,
  formatVnd,
  labelOf,
  presetRange,
  vnDateKey,
} from '../../utils/usageDashboard.js';
import WatermarkImagesChart from './WatermarkImagesChart.jsx';
import { ActivityLog, AiRequestLog } from './AdminUsageLists.jsx';
import AdminUsageConfig from './AdminUsageConfig.jsx';
import styles from './Admin.module.css';
import wm from './AdminWatermark.module.css';
import us from './AdminUsage.module.css';

const TABS = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'activity', label: 'Nhật ký hoạt động' },
  { value: 'ai', label: 'Sử dụng AI' },
  { value: 'config', label: 'Cấu hình & cảnh báo' },
];

const CHART_METRICS = [
  { value: 'cost_usd', label: 'Chi phí ước tính', format: formatUsd, detail: (p) => `${formatCount(p.attempts)} attempt · ${formatCount(p.cost_incomplete)} chưa đủ dữ liệu`, integer: false },
  { value: 'tokens', label: 'Token', format: (v) => `${formatCount(v)} token`, detail: (p) => `${formatCount(p.attempts)} attempt` },
  { value: 'requests', label: 'Request AI', format: (v) => `${formatCount(v)} request`, detail: (p) => `${formatCount(p.retries)} retry · ${formatCount(p.failed)} lỗi/không rõ` },
  { value: 'images_created', label: 'Ảnh tạo (local)', format: (v) => `${formatCount(v)} ảnh`, detail: (p) => `${formatCount(p.images_downloaded)} ảnh đã gửi tải` },
];

const EMPTY_FILTERS = { user: '', feature: '', status: '', model: '', keyAlias: '', environment: '' };
const timeFormatter = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' });

function Tile({ label, value, hint, tone, loading }) {
  return (
    <article className={`${styles.statCard} ${tone ? us[`tile_${tone}`] : ''}`}>
      <span>{label}</span>
      {loading ? <span className={styles.skeletonValue} aria-hidden="true" /> : <strong>{value}</strong>}
      {hint && <small>{hint}</small>}
    </article>
  );
}

function BudgetList({ budgets }) {
  if (!budgets?.length) return <p className={us.muted}>Chưa đặt ngân sách. Thêm ở tab “Cấu hình & cảnh báo”.</p>;
  return (
    <ul className={us.budgetList}>
      {budgets.map((budget) => {
        const percent = Number(budget.percent) || 0;
        const scope = budget.scope === 'global' ? 'Toàn ứng dụng' : budget.scope === 'key_alias' ? `Key ${budget.scope_value}` : `Người dùng ${budget.scope_label || budget.scope_value}`;
        return (
          <li key={budget.id} className={budget.level ? us.budgetAlert : undefined}>
            <div className={us.budgetHead}>
              <strong>{scope}</strong>
              <span>{formatUsd(budget.spent_usd)} / {formatUsd(budget.monthly_limit_usd)} ({percent.toLocaleString('vi-VN')}%)</span>
            </div>
            <div className={us.meter} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(percent, 100)} aria-label={`Đã dùng ${percent}% ngân sách`}>
              <span style={{ width: `${Math.min(percent, 100)}%` }} />
            </div>
            <small>
              {budget.level ? `Đã vượt ngưỡng cảnh báo ${budget.level}%. ` : `Ngưỡng cảnh báo: ${budget.alert_thresholds.join('/')}%. `}
              {budget.incomplete_attempts > 0 && `${formatCount(budget.incomplete_attempts)} attempt chưa đủ dữ liệu chi phí — số thực tế có thể cao hơn.`}
            </small>
          </li>
        );
      })}
    </ul>
  );
}

function CountTable({ rows, empty, statusLabels }) {
  if (!rows?.length) return <p className={us.muted}>{empty}</p>;
  return (
    <table className={us.miniTable}>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.status}-${row.code}`}>
            <td>{labelOf(statusLabels, row.status)}</td>
            <td title={row.code}>{labelOf(ERROR_LABELS, row.code === 'none' ? '' : row.code)}</td>
            <td className={styles.numberCell}>{formatCount(row.count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Overview({ state, onRefresh, onOpenRequestsFor }) {
  const [metric, setMetric] = useState('cost_usd');
  const [sweeping, setSweeping] = useState(false);
  const data = state.data;
  const loading = state.loading && !data;
  const activity = data?.activity;
  const ai = data?.ai;
  const health = data?.health;
  const cohort = data?.apply_cohort;
  const rate = health?.usd_to_vnd;
  const chartMetric = CHART_METRICS.find((item) => item.value === metric);
  const usageGaps = (Number(ai?.attempts_usage_unknown) || 0) + (Number(ai?.attempts_usage_missing) || 0);
  const costIncomplete = usageGaps + (Number(ai?.attempts_unpriced) || 0);
  const alerts = (data?.budgets || []).filter((budget) => budget.level);

  async function handleSweep() {
    setSweeping(true);
    const result = await sweepStaleUsage();
    setSweeping(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success(`Đã chuyển ${formatCount(result.data)} yêu cầu treo sang “Không xác định”.`);
      onRefresh();
    }
  }

  return (
    <>
      {health && !health.ai_enabled && (
        <div className={us.notice} role="status">
          <FaTriangleExclamation aria-hidden="true" />
          <span><strong>Đặt tên ảnh bằng AI đang tạm dừng.</strong> {health.paused_reason || ''} Yêu cầu mới bị từ chối ở máy chủ.</span>
        </div>
      )}
      {alerts.map((budget) => (
        <div key={budget.id} className={us.notice} role="status">
          <FaTriangleExclamation aria-hidden="true" />
          <span>
            Ngân sách ước tính {budget.scope === 'global' ? 'toàn ứng dụng' : budget.scope_value} đã dùng {Number(budget.percent).toLocaleString('vi-VN')}%
            (ngưỡng {budget.level}%). Đây là cảnh báo, không tự chặn chi phí.
          </span>
        </div>
      ))}

      <section className={styles.card} aria-labelledby="usage-activity-title">
        <div className={styles.cardHead}>
          <h2 id="usage-activity-title">Hoạt động trên thiết bị</h2>
          <span>Do trình duyệt báo cáo — có thể thiếu (mất mạng, chặn quảng cáo, đóng tab); chỉ dùng để phân tích.</span>
        </div>
        <div className={styles.statGrid}>
          <Tile label="Ảnh tạo (local)" value={formatCount(activity?.images_created)} hint={`${formatCount(activity?.create_operations)} lượt tạo · ${formatCount(activity?.images_create_failed)} ảnh lỗi`} loading={loading} />
          <Tile label="Thao tác tải" value={formatCount(activity?.download_operations)} hint={`${formatCount(activity?.zip_files)} file ZIP · ${formatCount(activity?.download_cancelled)} lượt hủy`} loading={loading} />
          <Tile label="Ảnh đã gửi tải" value={formatCount(activity?.images_downloaded)} hint={`${formatCount(activity?.images_written)} ảnh đã ghi file`} loading={loading} />
          <Tile label="Người dùng đăng nhập" value={formatCount(activity?.active_users)} hint="Tài khoản có hoạt động" loading={loading} />
          <Tile label="Visitor (khách)" value={formatCount(activity?.distinct_visitors)} hint="Trình duyệt khác nhau, không phải số người" loading={loading} />
          <Tile label="Áp dụng tên AI" value={formatCount(activity?.names_applied)} hint={`${formatCount(activity?.apply_operations)} lần bấm “Áp dụng tên”`} loading={loading} />
        </div>
        {data && data.legacy_watermark_images !== null && data.legacy_watermark_images !== undefined && (
          <p className={us.muted}>
            Tham chiếu: bộ đếm cũ <code>watermark_image_counts</code> ghi {formatCount(data.legacy_watermark_images)} ảnh trong cùng kỳ (nguồn riêng, không cộng vào số trên;
            nhật ký mới chỉ có từ {formatVnDateTime(health?.tracking_started_at)}).
          </p>
        )}
      </section>

      <section className={styles.card} aria-labelledby="usage-ai-title">
        <div className={styles.cardHead}>
          <h2 id="usage-ai-title">Đặt tên ảnh bằng AI</h2>
          <span>Máy chủ ghi từ JWT, cấu hình và phản hồi OpenAI.</span>
        </div>
        <div className={styles.statGrid}>
          <Tile label="Lượt chạy AI" value={formatCount(ai?.runs)} hint="Mỗi lần bấm tạo gợi ý" loading={loading} />
          <Tile label="Request (lô ảnh)" value={formatCount(ai?.requests)} hint={`${formatCount(ai?.rejected)} bị từ chối · ${formatCount(ai?.replays)} gửi lại được trả từ sổ`} loading={loading} />
          <Tile label="Attempt tới OpenAI" value={formatCount(ai?.attempts)} hint={`Retry: ${formatPercent(ai?.requests_with_retry, ai?.requests_called)} request`} loading={loading} />
          <Tile label="Ảnh gợi ý thành công" value={formatCount(ai?.images_succeeded)} hint={`${formatCount(ai?.images_failed)} lỗi · ${formatCount(ai?.needs_review)} cần kiểm tra · ${formatCount(ai?.provider_image_sends)} lượt ảnh gửi provider`} loading={loading} />
          <Tile label="Token đã ghi nhận" value={formatCount(ai?.total_tokens)} hint={`Vào ${formatCount(ai?.input_tokens)} (cache ${formatCount(ai?.cached_input_tokens)}) · Ra ${formatCount(ai?.output_tokens)}`} loading={loading} />
          <Tile
            label={costIncomplete ? 'Chi phí ước tính đã ghi nhận' : 'Chi phí ước tính'}
            value={formatUsd(ai?.estimated_cost_usd)}
            hint={[rate ? `≈ ${formatVnd(ai?.estimated_cost_usd, rate)} (tỷ giá ${formatCount(rate)})` : null, 'Không phải hóa đơn OpenAI'].filter(Boolean).join(' · ')}
            loading={loading}
          />
          <Tile label="Attempt chưa biết usage" value={formatCount(usageGaps)} hint={`${formatCount(ai?.attempts_usage_unknown)} không phản hồi · ${formatCount(ai?.attempts_usage_missing)} phản hồi thiếu usage`} tone={usageGaps ? 'warn' : undefined} loading={loading} />
          <Tile label="Attempt chưa có giá" value={formatCount(ai?.attempts_unpriced)} hint="Có token nhưng chưa có bảng giá khớp model" tone={ai?.attempts_unpriced ? 'warn' : undefined} loading={loading} />
        </div>
      </section>

      <section className={styles.card} aria-labelledby="usage-chart-title">
        <div className={styles.cardHead}>
          <h2 id="usage-chart-title">Theo ngày (giờ Việt Nam)</h2>
          <div className={wm.segmented} role="group" aria-label="Chỉ số">
            {CHART_METRICS.map((item) => (
              <button key={item.value} type="button" className={`${wm.segment} ${metric === item.value ? wm.segmentActive : ''}`} aria-pressed={metric === item.value} onClick={() => setMetric(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <WatermarkImagesChart
          series={data?.series || []}
          granularity="day"
          loading={loading}
          bucketKey="day"
          getValue={(point) => point[metric]}
          formatValue={chartMetric.format}
          formatTick={metric === 'cost_usd' ? formatUsd : formatCount}
          integerTicks={chartMetric.integer !== false}
          getDetail={chartMetric.detail}
          getCells={(point) => [chartMetric.format(point[metric]), chartMetric.detail(point)]}
          columns={[chartMetric.label, 'Chi tiết']}
          label={`${chartMetric.label} theo ngày`}
          emptyText="Không có dữ liệu cho chỉ số này trong khoảng thời gian đã chọn."
        />
      </section>

      <div className={us.twoColumns}>
        <section className={styles.card} aria-labelledby="usage-top-title">
          <div className={styles.cardHead}>
            <h2 id="usage-top-title">Người dùng theo chi phí</h2>
            <span>Top 10</span>
          </div>
          {data?.top_users?.length ? (
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${us.compactTable}`}>
                <thead>
                  <tr><th>Người dùng</th><th className={styles.alignRight}>Request</th><th className={styles.alignRight}>Token</th><th className={styles.alignRight}>Chi phí</th></tr>
                </thead>
                <tbody>
                  {data.top_users.map((user) => (
                    <tr key={user.user_id || 'deleted'}>
                      <td>
                        {user.user_id ? (
                          <button type="button" className={us.linkButton} onClick={() => onOpenRequestsFor(user.user_id)}>{user.name || user.email || user.user_id}</button>
                        ) : 'Tài khoản đã xóa'}
                        {user.email && user.name && <small className={us.subline}>{user.email}</small>}
                      </td>
                      <td className={styles.numberCell}>{formatCount(user.requests)}</td>
                      <td className={styles.numberCell}>{formatCount(user.tokens)}</td>
                      <td className={styles.numberCell} title={user.cost_incomplete ? `${user.cost_incomplete} attempt chưa đủ dữ liệu` : undefined}>
                        {formatUsd(user.cost_usd)}{user.cost_incomplete > 0 && ' *'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={us.muted}>{loading ? 'Đang tải…' : 'Chưa có yêu cầu AI trong kỳ.'}</p>}
        </section>

        <section className={styles.card} aria-labelledby="usage-rates-title">
          <div className={styles.cardHead}>
            <h2 id="usage-rates-title">Lỗi, retry và áp dụng</h2>
          </div>
          <dl className={us.rateList}>
            <div><dt>Request thất bại / không xác định</dt><dd>{formatPercent((ai?.requests_by_status?.failed || 0) + (ai?.requests_by_status?.unknown || 0), ai?.requests)}</dd></div>
            <div><dt>Request phải retry</dt><dd>{formatPercent(ai?.requests_with_retry, ai?.requests_called)}</dd></div>
            <div>
              <dt>Tên AI được áp dụng nguyên văn</dt>
              <dd>{formatPercent(cohort?.applied_unchanged, cohort?.suggested)}</dd>
              <small>
                Theo {formatCount(cohort?.runs)} lượt chạy bắt đầu trong kỳ (theo dõi tới khi áp dụng, kể cả ngày sau);
                {' '}{formatCount(cohort?.suggested)} gợi ý, {formatCount(cohort?.applied_unchanged)} giữ nguyên, {formatCount((cohort?.applied_total || 0) - (cohort?.applied_unchanged || 0))} đã sửa.
                {cohort?.runs_open > 0 && ` ${formatCount(cohort.runs_open)} lượt chưa kết thúc.`} Dữ liệu áp dụng do trình duyệt báo.
              </small>
            </div>
          </dl>
          <h3 className={us.subTitle}>Kết quả request</h3>
          <CountTable rows={data?.request_errors} statusLabels={REQUEST_STATUS_LABELS} empty="Không có request lỗi hay bị từ chối." />
          <h3 className={us.subTitle}>Lỗi theo attempt</h3>
          <CountTable rows={data?.attempt_errors} statusLabels={{ failed: 'Provider trả lỗi', unknown: 'Không phản hồi' }} empty="Không có attempt lỗi." />
        </section>
      </div>

      <div className={us.twoColumns}>
        <section className={styles.card} aria-labelledby="usage-budget-title">
          <div className={styles.cardHead}>
            <h2 id="usage-budget-title">Ngân sách tháng này</h2>
            <span>Ước tính nội bộ, chỉ cảnh báo</span>
          </div>
          <BudgetList budgets={data?.budgets} />
        </section>

        <section className={styles.card} aria-labelledby="usage-health-title">
          <div className={styles.cardHead}>
            <h2 id="usage-health-title">Sức khỏe dữ liệu</h2>
            {health?.stale_running > 0 && (
              <button type="button" className={styles.actionButton} onClick={handleSweep} disabled={sweeping}>
                {sweeping ? 'Đang xử lý…' : `Đánh dấu ${formatCount(health.stale_running)} yêu cầu treo`}
              </button>
            )}
          </div>
          <dl className={us.rateList}>
            <div><dt>Bắt đầu theo dõi</dt><dd>{formatVnDateTime(health?.tracking_started_at)}</dd></div>
            <div><dt>Sự kiện hoạt động gần nhất</dt><dd>{formatVnDateTime(health?.last_activity_at)}</dd></div>
            <div><dt>Request AI gần nhất</dt><dd>{formatVnDateTime(health?.last_request_at)}</dd></div>
            <div><dt>Đang chạy / treo quá hạn</dt><dd>{formatCount(health?.running_now)} / {formatCount(health?.stale_running)}</dd></div>
            <div><dt>Không xác định trong kỳ</dt><dd>{formatCount(health?.unknown_in_range)} ({formatCount(health?.swept_in_range)} do mất kết quả ghi)</dd></div>
            <div><dt>Attempt chưa đủ dữ liệu chi phí</dt><dd>{formatCount(costIncomplete)}</dd></div>
          </dl>
        </section>
      </div>
    </>
  );
}

export default function AdminUsagePage() {
  const [tab, setTab] = useState('overview');
  const [preset, setPreset] = useState('7d');
  const [customFrom, setCustomFrom] = useState(() => vnDateKey(new Date(Date.now() - 6 * 86400_000)));
  const [customTo, setCustomTo] = useState(() => vnDateKey(new Date()));
  const [filterInput, setFilterInput] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [reloadToken, setReloadToken] = useState(0);
  const [overview, setOverview] = useState({ data: null, loading: true, error: '' });
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const requestRef = useRef(0);

  // "Hôm nay" moves with each refresh, so the range is recomputed on reloadToken too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = useMemo(() => (preset === 'custom' ? customRange(customFrom, customTo) : presetRange(preset)), [preset, customFrom, customTo, reloadToken]);

  // The user box is free text: wait for typing to stop before querying.
  useEffect(() => {
    const timeout = window.setTimeout(() => setFilters(filterInput), 350);
    return () => window.clearTimeout(timeout);
  }, [filterInput]);

  useEffect(() => {
    if (range.error) return;
    const requestId = ++requestRef.current;

    async function load() {
      setOverview((current) => ({ ...current, loading: true }));
      const result = await getUsageOverview({ from: range.from, to: range.to, filters });
      if (requestId !== requestRef.current) return;
      // A failed refresh keeps the previous numbers and says so; errors are never shown as 0.
      setOverview((current) => ({ data: result.error ? current.data : result.data, loading: false, error: result.error || '' }));
      if (!result.error) setLastUpdatedAt(new Date());
    }

    load();
  }, [range, filters]);

  const options = overview.data?.options;
  const setFilter = (key) => (event) => setFilterInput((current) => ({ ...current, [key]: event.target.value }));
  const refresh = () => setReloadToken((token) => token + 1);
  const openRequestsFor = (userId) => {
    setFilterInput((current) => ({ ...current, user: userId }));
    setFilters((current) => ({ ...current, user: userId }));
    setTab('ai');
  };

  return (
    <>
      <Helmet><title>Sử dụng & chi phí</title></Helmet>

      <header className={styles.pageHeader}>
        <div><span>QUẢN TRỊ HỆ THỐNG</span><h1>SỬ DỤNG & CHI PHÍ</h1></div>
        <div className={styles.headerActions}>
          {lastUpdatedAt && <span className={wm.updatedAt}>Cập nhật {timeFormatter.format(lastUpdatedAt)}</span>}
          <button type="button" className={styles.actionButton} onClick={refresh} disabled={overview.loading}>
            <FaArrowsRotate aria-hidden="true" className={overview.loading ? styles.spin : undefined} />
            Làm mới
          </button>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Khu vực">
        {TABS.map((item) => (
          <button key={item.value} type="button" className={`${styles.tab} ${tab === item.value ? styles.tabActive : ''}`} aria-pressed={tab === item.value} onClick={() => setTab(item.value)}>
            {item.label}
          </button>
        ))}
      </nav>

      {tab !== 'config' && (
        <section className={styles.toolbar} aria-label="Bộ lọc">
          <div className={wm.segmented} role="group" aria-label="Khoảng thời gian">
            {RANGE_PRESETS.map((item) => (
              <button key={item.value} type="button" className={`${wm.segment} ${preset === item.value ? wm.segmentActive : ''}`} aria-pressed={preset === item.value} onClick={() => setPreset(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className={us.dateRange}>
              <label>Từ <input type="date" className={styles.control} value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
              <label>Đến <input type="date" className={styles.control} value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
            </div>
          )}
          <input type="search" className={`${styles.control} ${styles.search}`} value={filterInput.user} onChange={setFilter('user')} placeholder="Email hoặc user ID" aria-label="Lọc theo người dùng" />
          <select className={styles.control} value={filterInput.feature} onChange={setFilter('feature')} aria-label="Tính năng">
            <option value="">Mọi tính năng</option>
            {Object.entries(FEATURE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className={styles.control} value={filterInput.status} onChange={setFilter('status')} aria-label="Trạng thái">
            <option value="">Mọi trạng thái</option>
            {Object.entries(REQUEST_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            <option value="cancelled">Đã hủy (hoạt động)</option>
          </select>
          <select className={styles.control} value={filterInput.model} onChange={setFilter('model')} aria-label="Model">
            <option value="">Mọi model</option>
            {(options?.models || []).map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
          <select className={styles.control} value={filterInput.keyAlias} onChange={setFilter('keyAlias')} aria-label="Key alias">
            <option value="">Mọi key</option>
            {(options?.key_aliases || []).map((alias) => <option key={alias} value={alias}>{alias}</option>)}
          </select>
          <select className={styles.control} value={filterInput.environment} onChange={setFilter('environment')} aria-label="Môi trường">
            <option value="">Mọi môi trường</option>
            {(options?.environments || []).map((env) => <option key={env} value={env}>{env}</option>)}
          </select>
          {Object.values(filterInput).some(Boolean) && (
            <button type="button" className={styles.actionButton} onClick={() => { setFilterInput(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); }}>Xóa lọc</button>
          )}
        </section>
      )}

      {tab !== 'config' && (
        <p className={us.muted}>
          Giờ hiển thị và cách chia ngày theo giờ Việt Nam (UTC+7)
          {range.error ? '.' : `: ${formatVnDateTime(range.from)} → trước ${formatVnDateTime(range.to)}.`}
          {' '}Lọc trạng thái “Đã hủy” chỉ áp dụng cho nhật ký hoạt động.
        </p>
      )}

      {range.error && tab !== 'config' && <div className={styles.alert} role="alert"><span>{range.error}</span></div>}
      {overview.error && tab === 'overview' && (
        <div className={styles.alert} role="alert">
          <span>{overview.error}{overview.data ? ' Đang hiển thị số liệu của lần tải trước.' : ''}</span>
          <button type="button" onClick={refresh}>Thử lại</button>
        </div>
      )}

      {tab === 'overview' && !range.error && (overview.data || overview.loading) && (
        <Overview state={overview} onRefresh={refresh} onOpenRequestsFor={openRequestsFor} />
      )}
      {tab === 'activity' && !range.error && <ActivityLog range={range} filters={filters} reloadToken={reloadToken} />}
      {tab === 'ai' && !range.error && <AiRequestLog range={range} filters={filters} reloadToken={reloadToken} />}
      {tab === 'config' && <AdminUsageConfig reloadToken={reloadToken} />}
    </>
  );
}
