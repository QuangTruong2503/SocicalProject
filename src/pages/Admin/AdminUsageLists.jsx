import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { FaFileCsv } from 'react-icons/fa6';
import Dialog from '../../components/dialog/Dialog.jsx';
import {
  getAiUsageRequestDetail,
  getUsageOperation,
  listAiUsageRequests,
  listUsageActivity,
} from '../../services/adminUsageService.js';
import {
  ACTION_LABELS,
  ACTIVITY_STATUS_LABELS,
  ATTEMPT_STATUS_LABELS,
  COST_STATUS_LABELS,
  DELIVERY_LABELS,
  ERROR_LABELS,
  METHOD_LABELS,
  REQUEST_STATUS_LABELS,
  USAGE_STATUS_LABELS,
  formatCount,
  formatDuration,
  formatUsd,
  formatVnDateTime,
  labelOf,
} from '../../utils/usageDashboard.js';
import { downloadCsv } from '../../utils/csv.js';
import { CopyButton } from './AdminTableParts.jsx';
import { shortId } from './adminUtils.js';
import styles from './Admin.module.css';
import us from './AdminUsage.module.css';

const PAGE_SIZE = 50;
const CSV_LIMIT = 5000;

const STATUS_TONE = { succeeded: 'ok', partial: 'warn', failed: 'bad', cancelled: 'muted', rejected: 'muted', unknown: 'warn', running: 'info' };

function StatusBadge({ status, labels }) {
  return <span className={`${styles.badge} ${us[`status_${STATUS_TONE[status] || 'muted'}`]}`}>{labelOf(labels, status)}</span>;
}

function SubjectCell({ row }) {
  if (row.subject_type === 'visitor') {
    return (
      <span className={us.identity}>
        <span className={`${styles.badge} ${styles.badgeDefault}`}>Khách</span>
        <code title={row.visitor_id}>{shortId(row.visitor_id)}</code>
      </span>
    );
  }
  if (!row.user_id) return <span className={us.muted}>Tài khoản đã xóa</span>;
  return (
    <span className={us.identity}>
      <strong>{row.user_name || row.user_email || shortId(row.user_id)}</strong>
      {row.user_email && row.user_name && <small className={us.subline}>{row.user_email}</small>}
    </span>
  );
}

/**
 * Keyset-paginated list: filters change → first page; "Tải thêm" appends the
 * next page from the cursor. Errors are shown as errors, never as an empty list.
 */
function usePagedList(load, range, filters, reloadToken) {
  const [state, setState] = useState({ rows: [], cursor: null, hasMore: false, loading: true, loaded: false, error: '' });
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    async function run() {
      setState((current) => ({ ...current, loading: true, error: '' }));
      const result = await load({ from: range.from, to: range.to, filters, limit: PAGE_SIZE });
      if (requestId !== requestRef.current) return;
      setState(result.error
        ? { rows: [], cursor: null, hasMore: false, loading: false, loaded: true, error: result.error }
        : { rows: result.data.rows, cursor: result.data.next_cursor, hasMore: result.data.has_more, loading: false, loaded: true, error: '' });
    }
    run();
  }, [load, range, filters, reloadToken]);

  async function loadMore() {
    if (!state.cursor || state.loading) return;
    const requestId = requestRef.current;
    setState((current) => ({ ...current, loading: true }));
    const result = await load({ from: range.from, to: range.to, filters, cursor: state.cursor, limit: PAGE_SIZE });
    if (requestId !== requestRef.current) return;
    setState((current) => (result.error
      ? { ...current, loading: false, error: result.error }
      : { rows: [...current.rows, ...result.data.rows], cursor: result.data.next_cursor, hasMore: result.data.has_more, loading: false, loaded: true, error: '' }));
  }

  return { state, loadMore };
}

async function exportRows(load, range, filters, header, toRow, fileName) {
  const result = await load({ from: range.from, to: range.to, filters, limit: CSV_LIMIT });
  if (result.error) {
    toast.error(result.error);
    return;
  }
  if (!result.data.rows.length) {
    toast.info('Không có dữ liệu để xuất.');
    return;
  }
  downloadCsv(header, result.data.rows.map(toRow), fileName, { neutralizeFormulas: true });
  if (result.data.has_more) toast.warning(`Chỉ xuất ${formatCount(result.data.rows.length)} dòng đầu tiên. Hãy thu hẹp bộ lọc để xuất phần còn lại.`);
}

function ListFooter({ state, onMore }) {
  return (
    <div className={us.listFooter}>
      <span>{state.loaded ? `${formatCount(state.rows.length)} dòng${state.hasMore ? ' · còn nữa' : ''}` : 'Đang tải…'}</span>
      {state.hasMore && (
        <button type="button" className={styles.actionButton} onClick={onMore} disabled={state.loading}>
          {state.loading ? 'Đang tải…' : 'Tải thêm'}
        </button>
      )}
    </div>
  );
}

// ── Activity ───────────────────────────────────────────────────────────────

function OperationDialog({ id, onClose }) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    let active = true;
    getUsageOperation(id).then((result) => { if (active) setState({ data: result.data, error: result.error || '', loading: false }); });
    return () => { active = false; };
  }, [id]);

  return (
    <Dialog title="Chi tiết thao tác / bộ ảnh" onClose={onClose} variant="wide">
      <p className={us.muted}>Mã: <code>{id}</code> <CopyButton value={id} label="mã" /></p>
      {state.loading && <p>Đang tải…</p>}
      {state.error && <div className={styles.alert} role="alert"><span>{state.error}</span></div>}
      {state.data && (
        <>
          <h3 className={us.subTitle}>Sự kiện ({formatCount(state.data.events.length)})</h3>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${us.compactTable}`}>
              <thead><tr><th>Nhận lúc</th><th>Thao tác</th><th>Trạng thái</th><th>Số lượng</th><th>Cách tải</th><th>Mã lỗi</th></tr></thead>
              <tbody>
                {state.data.events.map((event) => (
                  <tr key={event.event_id}>
                    <td className={styles.dateCell}>{formatVnDateTime(event.received_at)}</td>
                    <td>{labelOf(ACTION_LABELS, event.action)}</td>
                    <td><StatusBadge status={event.status} labels={ACTIVITY_STATUS_LABELS} /></td>
                    <td>{formatCount(event.succeeded_count)}/{formatCount(event.requested_count)}</td>
                    <td>{event.download_method ? `${labelOf(METHOD_LABELS, event.download_method)} · ${labelOf(DELIVERY_LABELS, event.delivery)}` : '—'}</td>
                    <td>{labelOf(ERROR_LABELS, event.error_code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.data.requests.length > 0 && (
            <>
              <h3 className={us.subTitle}>Request AI của lượt chạy</h3>
              <ul className={us.plainList}>
                {state.data.requests.map((request) => (
                  <li key={request.id}>
                    {formatVnDateTime(request.created_at)} · {labelOf(REQUEST_STATUS_LABELS, request.status)} · {formatCount(request.images_succeeded)}/{formatCount(request.images_requested)} ảnh ·
                    {' '}{formatCount(request.attempts)} attempt · {formatUsd(request.estimated_cost_usd)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}

const ACTIVITY_CSV_HEADER = ['Nhận lúc (giờ VN)', 'Thời điểm trình duyệt (tham khảo)', 'Chủ thể', 'User ID', 'Tên', 'Email', 'Visitor ID', 'Thao tác', 'Nguồn', 'Trạng thái',
  'Yêu cầu', 'Thành công', 'Lỗi', 'Bỏ qua', 'Hủy', 'Đã chuẩn bị', 'Cách tải', 'Kích thước', 'Kết quả tải', 'Số file', 'Mã lỗi', 'Operation ID', 'Batch ID', 'AI run ID'];

export function ActivityLog({ range, filters, reloadToken }) {
  const [action, setAction] = useState('');
  const [operationId, setOperationId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const load = listUsageActivity;
  const listFilters = useStableFilters({ ...filters, action });
  const { state, loadMore } = usePagedList(load, range, listFilters, reloadToken);

  async function handleExport() {
    setExporting(true);
    await exportRows(load, range, listFilters, ACTIVITY_CSV_HEADER, (row) => [
      formatVnDateTime(row.received_at), formatVnDateTime(row.occurred_at), row.subject_type === 'user' ? 'Tài khoản' : 'Khách', row.user_id, row.user_name, row.user_email,
      row.visitor_id, labelOf(ACTION_LABELS, row.action), row.source_page, labelOf(ACTIVITY_STATUS_LABELS, row.status),
      row.requested_count, row.succeeded_count, row.failed_count, row.skipped_count, row.cancelled_count, row.prepared_count,
      row.download_method, row.image_size, labelOf(DELIVERY_LABELS, row.delivery), row.output_file_count, row.error_code,
      row.operation_id, row.image_batch_id, row.ai_run_id,
    ], `nhat-ky-hoat-dong-${range.from.slice(0, 10)}.csv`);
    setExporting(false);
  }

  return (
    <section className={styles.card} aria-labelledby="usage-activity-log-title">
      <div className={styles.cardHead}>
        <h2 id="usage-activity-log-title">Nhật ký hoạt động</h2>
        <div className={us.inlineControls}>
          <select className={styles.control} value={action} onChange={(event) => setAction(event.target.value)} aria-label="Thao tác">
            <option value="">Mọi thao tác</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="button" className={styles.actionButton} onClick={handleExport} disabled={exporting || !state.loaded}>
            <FaFileCsv aria-hidden="true" /> {exporting ? 'Đang xuất…' : 'Xuất CSV'}
          </button>
        </div>
      </div>
      <p className={us.muted}>“Đã gửi tới trình duyệt” nghĩa là ứng dụng đã kích hoạt tải; trình duyệt không xác nhận file đã lưu xong. “Đã ghi file” chỉ có khi ghi qua hộp chọn thư mục và đóng file thành công.</p>
      {state.error && <div className={styles.alert} role="alert"><span>{state.error}</span></div>}
      <div className={`${styles.tableWrap} ${state.loading && state.loaded ? styles.tableBusy : ''}`} aria-busy={state.loading}>
        <table className={`${styles.table} ${us.compactTable}`}>
          <thead>
            <tr><th>Thời gian</th><th>Người dùng / khách</th><th>Thao tác</th><th>Trạng thái</th><th className={styles.alignRight}>Số lượng</th><th>Cách tải</th><th>Mã lỗi</th><th aria-label="Chi tiết" /></tr>
          </thead>
          <tbody>
            {!state.loaded && Array.from({ length: 5 }, (_, index) => (
              <tr key={index} aria-hidden="true">{Array.from({ length: 8 }, (__, cell) => <td key={cell}><span className={styles.skeletonLine} /></td>)}</tr>
            ))}
            {state.loaded && !state.error && state.rows.length === 0 && (
              <tr><td colSpan={8} className={styles.emptyState}>Chưa có hoạt động trong khoảng thời gian này.</td></tr>
            )}
            {state.rows.map((row) => (
              <tr key={row.event_id}>
                <td className={styles.dateCell}>{formatVnDateTime(row.received_at)}</td>
                <td><SubjectCell row={row} /></td>
                <td>{labelOf(ACTION_LABELS, row.action)}<small className={us.subline}>{row.source_page}</small></td>
                <td><StatusBadge status={row.status} labels={ACTIVITY_STATUS_LABELS} /></td>
                <td className={styles.numberCell}>
                  {formatCount(row.succeeded_count)}/{formatCount(row.requested_count)}
                  {(row.failed_count > 0 || row.cancelled_count > 0 || row.skipped_count > 0) && (
                    <small className={us.subline}>{[row.failed_count && `${row.failed_count} lỗi`, row.skipped_count && `${row.skipped_count} bỏ qua`, row.cancelled_count && `${row.cancelled_count} hủy`].filter(Boolean).join(' · ')}</small>
                  )}
                </td>
                <td>
                  {row.download_method ? (
                    <>
                      {labelOf(METHOD_LABELS, row.download_method)} · {row.image_size === '800x600' ? '800×600' : 'Gốc'}
                      <small className={us.subline}>{row.delivery ? labelOf(DELIVERY_LABELS, row.delivery) : 'Chưa tải'}{row.output_file_count ? ` · ${row.output_file_count} file` : ''}</small>
                    </>
                  ) : row.action === 'ai.naming.apply' ? (
                    <small>{formatCount(row.metadata?.ai_unchanged_count)} giữ nguyên · {formatCount(row.metadata?.edited_count)} sửa</small>
                  ) : '—'}
                </td>
                <td>{labelOf(ERROR_LABELS, row.error_code)}</td>
                <td>
                  <button type="button" className={us.linkButton} onClick={() => setOperationId(row.image_batch_id || row.operation_id)}>Chi tiết</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ListFooter state={state} onMore={loadMore} />
      {operationId && <OperationDialog id={operationId} onClose={() => setOperationId(null)} />}
    </section>
  );
}

/** Same object while the values are the same, so effects do not refire on every render. */
function useStableFilters(filters) {
  const key = JSON.stringify(filters);
  return useMemo(() => JSON.parse(key), [key]);
}

// ── AI requests ────────────────────────────────────────────────────────────

function RequestDialog({ id, onClose }) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    let active = true;
    getAiUsageRequestDetail(id).then((result) => { if (active) setState({ data: result.data, error: result.error || '', loading: false }); });
    return () => { active = false; };
  }, [id]);
  const request = state.data?.request;

  return (
    <Dialog title="Chi tiết request AI" onClose={onClose} variant="wide">
      {state.loading && <p>Đang tải…</p>}
      {state.error && <div className={styles.alert} role="alert"><span>{state.error}</span></div>}
      {!state.loading && !state.error && !request && <p>Không tìm thấy request.</p>}
      {request && (
        <>
          <dl className={us.detailGrid}>
            <div><dt>Request ID (máy chủ)</dt><dd><code>{request.id}</code> <CopyButton value={request.id} label="request ID" /></dd></div>
            <div><dt>Mã yêu cầu của trình duyệt</dt><dd><code>{request.client_request_id || '—'}</code></dd></div>
            <div><dt>Lượt chạy AI</dt><dd><code>{request.ai_run_id || '—'}</code></dd></div>
            <div><dt>Người dùng</dt><dd>{request.user_name || request.user_email || request.user_id || 'Tài khoản đã xóa'}</dd></div>
            <div><dt>Trạng thái</dt><dd><StatusBadge status={request.status} labels={REQUEST_STATUS_LABELS} /> {labelOf(ERROR_LABELS, request.error_code)} {request.http_status ? `(HTTP ${request.http_status})` : ''}</dd></div>
            <div><dt>Ảnh</dt><dd>{formatCount(request.images_succeeded)}/{formatCount(request.images_requested)} thành công · {formatCount(request.images_failed)} lỗi · {formatCount(request.needs_review_count)} cần kiểm tra</dd></div>
            <div><dt>Model yêu cầu · key · môi trường</dt><dd>{request.requested_model || '—'} · {request.key_alias || '—'} · {request.environment}</dd></div>
            <div><dt>Thời gian</dt><dd>{formatVnDateTime(request.created_at)} → {formatVnDateTime(request.finished_at)} {request.finish_source === 'sweeper' ? '(đánh dấu tự động: mất kết quả)' : ''}</dd></div>
            <div><dt>Gửi lại được trả từ sổ</dt><dd>{formatCount(request.replay_count)}</dd></div>
          </dl>
          <h3 className={us.subTitle}>Attempt tới provider ({formatCount(state.data.attempts.length)})</h3>
          {state.data.attempts.length === 0 ? (
            <p className={us.muted}>{request.status === 'rejected' ? 'Bị từ chối trước khi gọi OpenAI — không có attempt.' : 'Chưa có attempt nào được ghi.'}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${us.compactTable}`}>
                <thead>
                  <tr><th>#</th><th>Kết quả</th><th>HTTP</th><th>Model thực tế</th><th>Usage</th><th className={styles.alignRight}>Token vào/ra</th><th className={styles.alignRight}>Chi phí</th><th>Độ trễ</th><th>ID provider</th></tr>
                </thead>
                <tbody>
                  {state.data.attempts.map((attempt) => (
                    <tr key={attempt.attempt_number}>
                      <td>{attempt.attempt_number}{attempt.will_retry && <small className={us.subline}>retry: {attempt.retry_reason}</small>}</td>
                      <td>{labelOf(ATTEMPT_STATUS_LABELS, attempt.status)}<small className={us.subline}>{labelOf(ERROR_LABELS, attempt.error_code)}{attempt.provider_error_code ? ` (${attempt.provider_error_code})` : ''}</small></td>
                      <td>{attempt.http_status ?? '—'}</td>
                      <td>{attempt.resolved_model || '—'}<small className={us.subline}>{attempt.service_tier || ''}</small></td>
                      <td>{labelOf(USAGE_STATUS_LABELS, attempt.usage_status)}</td>
                      <td className={styles.numberCell}>
                        {formatCount(attempt.input_tokens)} / {formatCount(attempt.output_tokens)}
                        {attempt.cached_input_tokens > 0 && <small className={us.subline}>cache {formatCount(attempt.cached_input_tokens)}</small>}
                        {attempt.reasoning_tokens > 0 && <small className={us.subline}>reasoning {formatCount(attempt.reasoning_tokens)} (đã nằm trong ra)</small>}
                      </td>
                      <td className={styles.numberCell}>
                        {attempt.cost_status === 'estimated' ? formatUsd(attempt.estimated_cost_usd) : labelOf(COST_STATUS_LABELS, attempt.cost_status)}
                        {attempt.price_version && <small className={us.subline}>giá {attempt.price_version}</small>}
                      </td>
                      <td>{formatDuration(attempt.latency_ms)}</td>
                      <td>
                        {attempt.provider_request_id && <code title="x-request-id">{attempt.provider_request_id}</code>}
                        {attempt.provider_response_id && <small className={us.subline} title="Response ID">{attempt.provider_response_id}</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

const AI_CSV_HEADER = ['Thời gian (giờ VN)', 'Request ID', 'Mã yêu cầu trình duyệt', 'AI run ID', 'User ID', 'Tên', 'Email', 'Trạng thái', 'Mã lỗi', 'HTTP',
  'Ảnh yêu cầu', 'Ảnh thành công', 'Ảnh lỗi', 'Cần kiểm tra', 'Attempt', 'Model yêu cầu', 'Model thực tế', 'Key alias', 'Môi trường',
  'Token vào', 'Token cache', 'Token ra', 'Tổng token', 'Chi phí ước tính (USD)', 'Attempt đã ước tính', 'Attempt chưa biết usage', 'Độ trễ (ms)'];

export function AiRequestLog({ range, filters, reloadToken }) {
  const [lookupInput, setLookupInput] = useState('');
  const [lookup, setLookup] = useState('');
  const [requestId, setRequestId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const load = listAiUsageRequests;
  const listFilters = useStableFilters(lookup ? { requestId: lookup } : filters);
  const { state, loadMore } = usePagedList(load, range, listFilters, reloadToken);

  async function handleExport() {
    setExporting(true);
    await exportRows(load, range, listFilters, AI_CSV_HEADER, (row) => [
      formatVnDateTime(row.created_at), row.id, row.client_request_id, row.ai_run_id, row.user_id, row.user_name, row.user_email,
      labelOf(REQUEST_STATUS_LABELS, row.status), row.error_code, row.http_status, row.images_requested, row.images_succeeded, row.images_failed,
      row.needs_review_count, row.attempts, row.requested_model, row.resolved_model, row.key_alias, row.environment,
      row.input_tokens, row.cached_input_tokens, row.output_tokens, row.total_tokens, row.estimated_cost_usd, row.attempts_estimated, row.usage_unknown, row.latency_ms,
    ], `su-dung-ai-${range.from.slice(0, 10)}.csv`);
    setExporting(false);
  }

  return (
    <section className={styles.card} aria-labelledby="usage-ai-log-title">
      <div className={styles.cardHead}>
        <h2 id="usage-ai-log-title">Request đặt tên ảnh bằng AI</h2>
        <form
          className={us.inlineControls}
          onSubmit={(event) => { event.preventDefault(); setLookup(lookupInput.trim()); }}
        >
          <input type="search" className={styles.control} value={lookupInput} onChange={(event) => { setLookupInput(event.target.value); if (!event.target.value) setLookup(''); }}
            placeholder="Request ID / x-request-id / run ID" aria-label="Tra cứu theo mã" maxLength={128} />
          <button type="submit" className={styles.actionButton}>Tra cứu</button>
          <button type="button" className={styles.actionButton} onClick={handleExport} disabled={exporting || !state.loaded}>
            <FaFileCsv aria-hidden="true" /> {exporting ? 'Đang xuất…' : 'Xuất CSV'}
          </button>
        </form>
      </div>
      {lookup && <p className={us.muted}>Đang tra cứu “{lookup}” trên toàn bộ thời gian (bỏ qua bộ lọc khác).</p>}
      {state.error && <div className={styles.alert} role="alert"><span>{state.error}</span></div>}
      <div className={`${styles.tableWrap} ${state.loading && state.loaded ? styles.tableBusy : ''}`} aria-busy={state.loading}>
        <table className={`${styles.table} ${us.compactTable}`}>
          <thead>
            <tr><th>Thời gian</th><th>Người dùng</th><th>Trạng thái</th><th className={styles.alignRight}>Ảnh</th><th className={styles.alignRight}>Attempt</th><th>Model · key · môi trường</th><th className={styles.alignRight}>Token</th><th className={styles.alignRight}>Chi phí</th><th>Độ trễ</th><th aria-label="Chi tiết" /></tr>
          </thead>
          <tbody>
            {!state.loaded && Array.from({ length: 5 }, (_, index) => (
              <tr key={index} aria-hidden="true">{Array.from({ length: 10 }, (__, cell) => <td key={cell}><span className={styles.skeletonLine} /></td>)}</tr>
            ))}
            {state.loaded && !state.error && state.rows.length === 0 && (
              <tr><td colSpan={10} className={styles.emptyState}>{lookup ? 'Không tìm thấy request với mã này.' : 'Chưa có request AI trong khoảng thời gian này.'}</td></tr>
            )}
            {state.rows.map((row) => {
              const costIncomplete = row.attempts > 0 && row.attempts_estimated < row.attempts;
              return (
                <tr key={row.id}>
                  <td className={styles.dateCell}>{formatVnDateTime(row.created_at)}</td>
                  <td><SubjectCell row={{ ...row, subject_type: 'user' }} /></td>
                  <td><StatusBadge status={row.status} labels={REQUEST_STATUS_LABELS} /><small className={us.subline}>{labelOf(ERROR_LABELS, row.error_code)}</small></td>
                  <td className={styles.numberCell}>
                    {formatCount(row.images_succeeded)}/{formatCount(row.images_requested)}
                    {row.needs_review_count > 0 && <small className={us.subline}>{row.needs_review_count} cần kiểm tra</small>}
                  </td>
                  <td className={styles.numberCell}>{formatCount(row.attempts)}{row.attempts > 1 && <small className={us.subline}>{row.attempts - 1} retry</small>}</td>
                  <td>{row.resolved_model || row.requested_model || '—'}<small className={us.subline}>{row.key_alias || '—'} · {row.environment}</small></td>
                  <td className={styles.numberCell}>{formatCount(row.total_tokens)}{row.usage_unknown > 0 && <small className={us.subline}>{row.usage_unknown} chưa biết</small>}</td>
                  <td className={styles.numberCell} title={costIncomplete ? 'Có attempt chưa đủ dữ liệu chi phí' : undefined}>
                    {row.attempts_estimated > 0 ? formatUsd(row.estimated_cost_usd) : row.attempts ? 'Chưa biết' : '—'}{costIncomplete && row.attempts_estimated > 0 && ' *'}
                  </td>
                  <td>{formatDuration(row.latency_ms)}</td>
                  <td><button type="button" className={us.linkButton} onClick={() => setRequestId(row.id)}>Chi tiết</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ListFooter state={state} onMore={loadMore} />
      <p className={us.muted}>* Chỉ là phần đã ghi nhận: có attempt chưa biết usage hoặc chưa có giá. Chi phí là ước tính nội bộ, không phải hóa đơn.</p>
      {requestId && <RequestDialog id={requestId} onClose={() => setRequestId(null)} />}
    </section>
  );
}
