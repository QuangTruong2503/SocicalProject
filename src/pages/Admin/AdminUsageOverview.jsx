import { useState } from 'react';
import { toast } from 'react-toastify';
import { FaTriangleExclamation } from 'react-icons/fa6';
import { sweepStaleUsage } from '../../services/adminUsageService.js';
import {
  ERROR_LABELS,
  REQUEST_STATUS_LABELS,
  formatCount,
  formatPercent,
  formatUsd,
  formatVnDateTime,
  formatVnd,
  labelOf,
} from '../../utils/usageDashboard.js';
import WatermarkImagesChart from './WatermarkImagesChart.jsx';
import styles from './Admin.module.css';
import wm from './AdminWatermark.module.css';
import us from './AdminUsage.module.css';

const CHART_METRICS = [
  { value: 'cost_usd', label: 'Chi phí ước tính', format: formatUsd, detail: (p) => `${formatCount(p.attempts)} attempt · ${formatCount(p.cost_incomplete)} chưa đủ dữ liệu`, integer: false },
  { value: 'tokens', label: 'Token', format: (v) => `${formatCount(v)} token`, detail: (p) => `${formatCount(p.attempts)} attempt` },
  { value: 'requests', label: 'Request AI', format: (v) => `${formatCount(v)} request`, detail: (p) => `${formatCount(p.retries)} retry · ${formatCount(p.failed)} lỗi/không rõ` },
  { value: 'images_created', label: 'Ảnh tạo (local)', format: (v) => `${formatCount(v)} ảnh`, detail: (p) => `${formatCount(p.images_downloaded)} ảnh đã gửi tải` },
];


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

export default function AdminUsageOverview({ state, onRefresh, onOpenRequestsFor, onNavigate }) {
  const [metric, setMetric] = useState('images_created');
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
      <section className={us.headlineGrid} aria-label="Chỉ số chính">
        <Tile label="Ảnh đã tạo" value={formatCount(activity?.images_created)} hint="Từ nhật ký hoạt động" loading={loading} />
        <Tile label="Ảnh đã gửi tải" value={formatCount(activity?.images_downloaded)} hint={`${formatCount(activity?.download_operations)} lượt tải xuống`} loading={loading} />
        <Tile label="Ảnh có gợi ý AI" value={formatCount(ai?.images_succeeded)} hint={`${formatCount(ai?.runs)} lượt chạy AI`} loading={loading} />
        <Tile label="Chi phí AI ước tính" value={formatUsd(ai?.estimated_cost_usd)} hint={costIncomplete ? `${formatCount(costIncomplete)} lần gọi chưa đủ dữ liệu chi phí` : 'Không phải hóa đơn OpenAI'} tone={costIncomplete ? 'warn' : undefined} loading={loading} />
      </section>
      <div className={us.overviewGuide}>
        <div><strong>Một nơi theo dõi toàn bộ việc sử dụng</strong><p>Xem ảnh Watermark theo nguồn và người dùng; theo dõi riêng lượt tải, đặt tên AI và chi phí.</p></div>
        <button type="button" className={styles.actionButton} onClick={() => onNavigate('watermark')}>Xem thống kê Watermark →</button>
      </div>
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

      <details className={us.detailSection}>
        <summary>Chi tiết ảnh, lượt tải & người dùng</summary>
        <div className={us.detailBody}>
        <p className={us.muted}>Do trình duyệt báo cáo — có thể thiếu khi mất mạng hoặc đóng tab; chỉ dùng để phân tích.</p>
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
        </div>
      </details>

      <details className={us.detailSection}>
        <summary>Chi tiết AI, token & chất lượng dữ liệu</summary>
        <div className={us.detailBody}>
        <p className={us.muted}>Số liệu máy chủ ghi nhận từ các lần gọi OpenAI.</p>
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
        </div>
      </details>

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

