import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import Dialog from '../../components/dialog/Dialog.jsx';
import { changeUsageConfig, getUsageConfig } from '../../services/adminUsageService.js';
import { formatCount, formatUsd, formatVnDateTime } from '../../utils/usageDashboard.js';
import { IMAGE_NAME_MODELS } from '../../utils/aiImageNaming.js';
import styles from './Admin.module.css';
import us from './AdminUsage.module.css';

const PLAN_ROWS = [
  { plan: 'free', label: 'Free' },
  { plan: 'pro', label: 'Pro' },
  { plan: 'enterprise', label: 'Enterprise' },
  { plan: 'admin', label: 'Quản trị viên' },
];

const LIMIT_FIELDS = [
  { key: 'window_seconds', label: 'Cửa sổ tần suất (giây)', min: 60, max: 86400 },
  { key: 'max_requests_per_window', label: 'Request tối đa / cửa sổ / người', min: 1, max: 10000 },
  { key: 'max_images_per_window', label: 'Ảnh tối đa / cửa sổ / người', min: 1, max: 100000 },
  { key: 'max_concurrent_per_user', label: 'Request đồng thời / người', min: 1, max: 50 },
  { key: 'max_concurrent_total', label: 'Request đồng thời toàn hệ thống', min: 1, max: 1000 },
  { key: 'lease_ttl_seconds', label: 'Coi là treo sau (giây)', min: 60, max: 3600 },
];

const ACTION_LABELS = {
  'settings.update': 'Đổi thiết lập',
  'plan_quota.upsert': 'Hạn mức theo gói',
  'plan_models.update': 'Model theo gói',
  'user_quota.upsert': 'Ngoại lệ người dùng',
  'user_quota.delete': 'Xóa ngoại lệ',
  'budget.upsert': 'Ngân sách',
  'budget.delete': 'Xóa ngân sách',
  'price.add': 'Thêm giá',
};

const toIntOrNull = (value) => (String(value).trim() === '' ? null : Number(value));

function describeChange(entry) {
  const before = entry.before_value || {};
  const after = entry.after_value || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  if (!keys.length) return '—';
  return keys.slice(0, 6).map((key) => `${key}: ${JSON.stringify(before[key] ?? null)} → ${JSON.stringify(after[key] ?? null)}`).join('; ');
}

function useConfig(reloadToken) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [version, setVersion] = useState(0);
  const requestRef = useRef(0);
  useEffect(() => {
    const requestId = ++requestRef.current;
    async function load() {
      setState((current) => ({ ...current, loading: true }));
      const result = await getUsageConfig();
      if (requestId !== requestRef.current) return;
      setState((current) => ({ data: result.error ? current.data : result.data, loading: false, error: result.error || '' }));
    }
    load();
  }, [reloadToken, version]);
  return [state, () => setVersion((value) => value + 1)];
}

export default function AdminUsageConfig({ reloadToken }) {
  const [state, reload] = useConfig(reloadToken);
  const [busy, setBusy] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const settings = state.data?.settings;

  async function apply(action, payload, success) {
    setBusy(true);
    const result = await changeUsageConfig(action, payload);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    toast.success(success);
    reload();
    return true;
  }

  if (!state.data) {
    return state.error
      ? <div className={styles.alert} role="alert"><span>{state.error}</span><button type="button" onClick={reload}>Thử lại</button></div>
      : <p role="status">Đang tải cấu hình…</p>;
  }

  return (
    <>
      {state.error && <div className={styles.alert} role="alert"><span>{state.error}</span><button type="button" onClick={reload}>Thử lại</button></div>}

      <section className={styles.card} aria-labelledby="usage-switch-title">
        <div className={styles.cardHead}>
          <h2 id="usage-switch-title">Công tắc Đặt tên ảnh bằng AI</h2>
          <span>Máy chủ từ chối yêu cầu mới khi tắt; kết quả đã có vẫn trả lại được.</span>
        </div>
        <div className={us.switchRow}>
          <span className={`${styles.badge} ${settings.ai_enabled ? styles.badgeActive : styles.badgeSuspended}`}>{settings.ai_enabled ? 'Đang bật' : 'Đang tạm dừng'}</span>
          {!settings.ai_enabled && settings.paused_reason && <span>Lý do: {settings.paused_reason}</span>}
          {settings.ai_enabled ? (
            <button type="button" className={styles.dangerButton} onClick={() => setPauseOpen(true)} disabled={busy}>Tạm dừng AI</button>
          ) : (
            <button type="button" className={styles.primary} onClick={() => apply('settings.update', { ai_enabled: true, paused_reason: null }, 'Đã bật lại Đặt tên ảnh bằng AI.')} disabled={busy}>Bật lại</button>
          )}
        </div>
        <p className={us.muted}>Ngân sách bên dưới chỉ để cảnh báo, không phải giới hạn chi tiêu cứng. Key OpenAI dùng ở dự án khác phát sinh phí ngoài sổ này — nên dùng key/project riêng cho từng môi trường và tính năng, kèm spend limit trên OpenAI.</p>
      </section>

      <LimitsForm settings={settings} busy={busy} onSave={(patch) => apply('settings.update', patch, 'Đã lưu giới hạn.')} />
      <PlanModels rows={state.data.plan_models} busy={busy} onSave={(payload) => apply('plan_models.update', payload, 'Đã lưu model theo gói.')} />
      <PlanQuotas quotas={state.data.plan_quotas} enforced={settings.quota_enforced} busy={busy} onSave={(payload) => apply('plan_quota.upsert', payload, 'Đã lưu hạn mức theo gói.')} />
      <UserQuotas rows={state.data.user_quotas} busy={busy} onSave={(payload) => apply('user_quota.upsert', payload, 'Đã lưu ngoại lệ.')} onDelete={(user) => apply('user_quota.delete', { user }, 'Đã xóa ngoại lệ.')} />
      <Budgets budgets={state.data.budgets} statuses={state.data.budget_status} busy={busy} onSave={(payload) => apply('budget.upsert', payload, 'Đã lưu ngân sách.')} onDelete={(id) => apply('budget.delete', { id }, 'Đã xóa ngân sách.')} />
      <Prices prices={state.data.prices} busy={busy} onAdd={(payload) => apply('price.add', payload, 'Đã thêm giá mới.')} />

      <section className={styles.card} aria-labelledby="usage-audit-title">
        <div className={styles.cardHead}>
          <h2 id="usage-audit-title">Nhật ký thay đổi cấu hình</h2>
          <span>50 thay đổi gần nhất</span>
        </div>
        {state.data.audit.length === 0 ? <p className={us.muted}>Chưa có thay đổi.</p> : (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${us.compactTable}`}>
              <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th><th>Trước → sau</th></tr></thead>
              <tbody>
                {state.data.audit.map((entry) => (
                  <tr key={entry.id}>
                    <td className={styles.dateCell}>{formatVnDateTime(entry.created_at)}</td>
                    <td>{entry.actor_email || entry.actor_id || '—'}</td>
                    <td>{ACTION_LABELS[entry.action] || entry.action}</td>
                    <td><code>{entry.target}</code></td>
                    <td className={us.wrapCell}>{describeChange(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pauseOpen && (
        <PauseDialog
          busy={busy}
          onCancel={() => setPauseOpen(false)}
          onConfirm={async (reason) => {
            if (await apply('settings.update', { ai_enabled: false, paused_reason: reason }, 'Đã tạm dừng Đặt tên ảnh bằng AI.')) setPauseOpen(false);
          }}
        />
      )}
    </>
  );
}

function PauseDialog({ busy, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog title="Tạm dừng Đặt tên ảnh bằng AI?" onClose={onCancel} busy={busy}>
      <p>Mọi yêu cầu mới sẽ bị từ chối ở máy chủ cho tới khi bật lại. Người dùng vẫn đổi tên thủ công được.</p>
      <label className={styles.modalField}>
        Lý do (hiển thị trong dashboard)
        <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} data-dialog-initial />
      </label>
      <div className={styles.modalActions}>
        <button type="button" onClick={onCancel} disabled={busy}>Hủy</button>
        <button type="button" className={styles.dangerButton} onClick={() => onConfirm(reason.trim() || null)} disabled={busy}>{busy ? 'Đang lưu…' : 'Tạm dừng'}</button>
      </div>
    </Dialog>
  );
}

function LimitsForm({ settings, busy, onSave }) {
  const initial = () => ({
    ...Object.fromEntries(LIMIT_FIELDS.map((field) => [field.key, String(settings[field.key])])),
    quota_enforced: settings.quota_enforced,
    usd_to_vnd: settings.usd_to_vnd ?? '',
    usd_to_vnd_as_of: settings.usd_to_vnd_as_of ?? '',
  });
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    const patch = {};
    for (const field of LIMIT_FIELDS) {
      const value = Number(form[field.key]);
      if (!Number.isInteger(value) || value < field.min || value > field.max) {
        setError(`${field.label}: từ ${field.min} đến ${field.max}.`);
        return;
      }
      if (value !== settings[field.key]) patch[field.key] = value;
    }
    if (form.quota_enforced !== settings.quota_enforced) patch.quota_enforced = form.quota_enforced;
    const rate = String(form.usd_to_vnd).trim() === '' ? null : Number(form.usd_to_vnd);
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
      setError('Tỷ giá phải là số dương.');
      return;
    }
    if (rate !== (settings.usd_to_vnd === null ? null : Number(settings.usd_to_vnd))) patch.usd_to_vnd = rate;
    if ((form.usd_to_vnd_as_of || null) !== (settings.usd_to_vnd_as_of || null)) patch.usd_to_vnd_as_of = form.usd_to_vnd_as_of || null;
    setError('');
    if (Object.keys(patch).length) onSave(patch);
  }

  return (
    <section className={styles.card} aria-labelledby="usage-limits-title">
      <div className={styles.cardHead}>
        <h2 id="usage-limits-title">Giới hạn dùng chung</h2>
        <span>Áp dụng cho mọi instance Edge Function, kiểm tra trong một transaction trước khi gọi OpenAI.</span>
      </div>
      <form onSubmit={submit}>
        <div className={us.formGrid}>
          {LIMIT_FIELDS.map((field) => (
            <label key={field.key} className={styles.modalField}>
              {field.label}
              <input type="number" className={styles.control} min={field.min} max={field.max} value={form[field.key]}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} />
            </label>
          ))}
          <label className={styles.modalField}>
            Tỷ giá USD → VND (tùy chọn)
            <input type="number" className={styles.control} min="1" step="1" value={form.usd_to_vnd} onChange={(event) => setForm((current) => ({ ...current, usd_to_vnd: event.target.value }))} />
          </label>
          <label className={styles.modalField}>
            Tỷ giá tại ngày
            <input type="date" className={styles.control} value={form.usd_to_vnd_as_of} onChange={(event) => setForm((current) => ({ ...current, usd_to_vnd_as_of: event.target.value }))} />
          </label>
        </div>
        <label className={styles.modalCheckbox}>
          <input type="checkbox" checked={form.quota_enforced} onChange={(event) => setForm((current) => ({ ...current, quota_enforced: event.target.checked }))} />
          Áp dụng hạn mức ảnh theo ngày/tháng (theo gói và ngoại lệ bên dưới)
        </label>
        {error && <p className={us.fieldError} role="alert">{error}</p>}
        <div className={styles.modalActions}>
          <button type="button" onClick={() => { setForm(initial()); setError(''); }} disabled={busy}>Hoàn tác</button>
          <button type="submit" className={styles.primary} disabled={busy}>Lưu giới hạn</button>
        </div>
      </form>
    </section>
  );
}

function PlanModels({ rows, busy, onSave }) {
  return (
    <section className={styles.card} aria-labelledby="usage-models-title">
      <div className={styles.cardHead}>
        <h2 id="usage-models-title">Model AI theo gói</h2>
        <span>Chọn model được phép dùng cho Đặt tên ảnh bằng AI.</span>
      </div>
      <p className={us.muted}>Mỗi gói dùng đúng các model được chọn, không kế thừa từ gói khác. Bỏ chọn tất cả để tắt AI cho gói đó. Tài khoản admin áp dụng dòng Quản trị viên.</p>
      {!rows ? <p className={us.fieldError} role="alert">Chưa áp dụng migration phân quyền model theo gói (ai_naming_plan_models.sql).</p> : (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${us.compactTable}`}>
            <thead><tr><th>Gói</th>{IMAGE_NAME_MODELS.map(({ id, label }) => <th key={id}>{label}</th>)}<th aria-label="Lưu model" /></tr></thead>
            <tbody>
              {PLAN_ROWS.map(({ plan, label }) => {
                const models = rows.find((row) => row.plan === plan)?.allowed_models || [];
                return <PlanModelRow key={`${plan}:${models.join(',')}`} plan={plan} label={label} models={models} busy={busy} onSave={onSave} />;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PlanModelRow({ plan, label, models, busy, onSave }) {
  const [selected, setSelected] = useState(models);
  const dirty = IMAGE_NAME_MODELS.some(({ id }) => selected.includes(id) !== models.includes(id));
  return (
    <tr>
      <th scope="row">{label}</th>
      {IMAGE_NAME_MODELS.map(({ id, label: modelLabel }) => (
        <td key={id}>
          <input type="checkbox" checked={selected.includes(id)} disabled={busy}
            aria-label={`Cho phép ${modelLabel}, gói ${label}`}
            onChange={(event) => setSelected((current) => event.target.checked ? [...current, id] : current.filter((value) => value !== id))} />
        </td>
      ))}
      <td>
        <button type="button" className={styles.actionButton} disabled={busy || !dirty} aria-label={`Lưu model gói ${label}`}
          onClick={() => onSave({ plan, allowed_models: IMAGE_NAME_MODELS.filter(({ id }) => selected.includes(id)).map(({ id }) => id) })}>Lưu</button>
      </td>
    </tr>
  );
}

function PlanQuotas({ quotas, enforced, busy, onSave }) {
  const byPlan = Object.fromEntries(quotas.map((row) => [row.plan, row]));
  const [form, setForm] = useState(() => Object.fromEntries(PLAN_ROWS.map(({ plan }) => [plan, {
    daily: byPlan[plan]?.daily_image_limit ?? '', monthly: byPlan[plan]?.monthly_image_limit ?? '',
  }])));
  const update = (plan, key) => (event) => setForm((current) => ({ ...current, [plan]: { ...current[plan], [key]: event.target.value } }));

  return (
    <section className={styles.card} aria-labelledby="usage-plan-title">
      <div className={styles.cardHead}>
        <h2 id="usage-plan-title">Hạn mức ảnh AI theo gói</h2>
        <span>{enforced ? 'Đang áp dụng' : 'Chưa áp dụng — bật ở mục Giới hạn dùng chung'} · để trống = không giới hạn · ngày/tháng theo giờ Việt Nam</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${us.compactTable} ${us.narrowTable}`}>
          <thead><tr><th>Gói</th><th>Ảnh / ngày</th><th>Ảnh / tháng</th><th aria-label="Lưu" /></tr></thead>
          <tbody>
            {PLAN_ROWS.map(({ plan, label }) => (
              <tr key={plan}>
                <td>{label}</td>
                <td><input type="number" min="0" className={`${styles.control} ${us.numberInput}`} value={form[plan].daily} onChange={update(plan, 'daily')} aria-label={`Ảnh mỗi ngày, gói ${label}`} /></td>
                <td><input type="number" min="0" className={`${styles.control} ${us.numberInput}`} value={form[plan].monthly} onChange={update(plan, 'monthly')} aria-label={`Ảnh mỗi tháng, gói ${label}`} /></td>
                <td>
                  <button type="button" className={styles.actionButton} disabled={busy}
                    onClick={() => onSave({ plan, daily_image_limit: toIntOrNull(form[plan].daily), monthly_image_limit: toIntOrNull(form[plan].monthly) })}>Lưu</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={us.muted}>Đơn vị là số ảnh đã gửi tới OpenAI (mỗi lô được tính một lần, kể cả khi retry). Ảnh của request quá hạn hoặc lỗi sau khi đã gửi không được hoàn lại.</p>
    </section>
  );
}

function UserQuotas({ rows, busy, onSave, onDelete }) {
  const [form, setForm] = useState({ user: '', daily: '', monthly: '', unlimited: false, note: '' });
  return (
    <section className={styles.card} aria-labelledby="usage-override-title">
      <div className={styles.cardHead}>
        <h2 id="usage-override-title">Ngoại lệ theo người dùng</h2>
        <span>Ghi đè hạn mức của gói; vẫn được ghi usage đầy đủ.</span>
      </div>
      {rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${us.compactTable}`}>
            <thead><tr><th>Người dùng</th><th>Ảnh / ngày</th><th>Ảnh / tháng</th><th>Không giới hạn</th><th>Ghi chú</th><th aria-label="Xóa" /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.user_id}>
                  <td>{row.email || row.user_id}</td>
                  <td>{row.daily_image_limit ?? 'Theo gói'}</td>
                  <td>{row.monthly_image_limit ?? 'Theo gói'}</td>
                  <td>{row.unlimited ? 'Có' : 'Không'}</td>
                  <td>{row.note || '—'}</td>
                  <td><button type="button" className={us.linkButton} onClick={() => onDelete(row.user_id)} disabled={busy}>Xóa</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className={us.formGrid} onSubmit={(event) => {
        event.preventDefault();
        onSave({ user: form.user.trim(), daily_image_limit: toIntOrNull(form.daily), monthly_image_limit: toIntOrNull(form.monthly), unlimited: form.unlimited, note: form.note });
      }}>
        <label className={styles.modalField}>Email hoặc user ID<input type="text" value={form.user} onChange={(event) => setForm({ ...form, user: event.target.value })} required /></label>
        <label className={styles.modalField}>Ảnh / ngày<input type="number" min="0" className={styles.control} value={form.daily} onChange={(event) => setForm({ ...form, daily: event.target.value })} /></label>
        <label className={styles.modalField}>Ảnh / tháng<input type="number" min="0" className={styles.control} value={form.monthly} onChange={(event) => setForm({ ...form, monthly: event.target.value })} /></label>
        <label className={styles.modalField}>Ghi chú<input type="text" maxLength={200} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
        <label className={styles.modalCheckbox}><input type="checkbox" checked={form.unlimited} onChange={(event) => setForm({ ...form, unlimited: event.target.checked })} /> Không giới hạn</label>
        <div className={styles.modalActions}><button type="submit" className={styles.primary} disabled={busy || !form.user.trim()}>Lưu ngoại lệ</button></div>
      </form>
    </section>
  );
}

function Budgets({ budgets, statuses, busy, onSave, onDelete }) {
  const statusById = Object.fromEntries((statuses || []).map((status) => [status.id, status]));
  const [form, setForm] = useState({ scope: 'global', scope_value: '', monthly_limit_usd: '', thresholds: '70,90,100' });
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    const limit = Number(form.monthly_limit_usd);
    const thresholds = form.thresholds.split(',').map((value) => Number(value.trim())).filter((value) => value);
    if (!Number.isFinite(limit) || limit <= 0) return setError('Ngân sách phải lớn hơn 0 USD.');
    if (!thresholds.length || thresholds.some((value) => !Number.isInteger(value) || value < 1 || value > 200)) return setError('Ngưỡng là các số nguyên 1–200, cách nhau bằng dấu phẩy.');
    if (form.scope !== 'global' && !form.scope_value.trim()) return setError('Nhập key alias hoặc email người dùng.');
    setError('');
    const existing = budgets.find((budget) => budget.scope === form.scope && (budget.scope_value || '') === (form.scope === 'global' ? '' : form.scope_value.trim()));
    onSave({
      ...(existing ? { id: existing.id } : {}),
      scope: form.scope,
      scope_value: form.scope === 'global' ? null : form.scope_value.trim(),
      monthly_limit_usd: limit,
      alert_thresholds: thresholds,
      active: true,
    });
    return undefined;
  }

  return (
    <section className={styles.card} aria-labelledby="usage-budget-config-title">
      <div className={styles.cardHead}>
        <h2 id="usage-budget-config-title">Ngân sách ước tính theo tháng</h2>
        <span>Chỉ cảnh báo trong dashboard (mặc định 70/90/100%), không gửi email/Slack, không chặn chi phí.</span>
      </div>
      {budgets.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${us.compactTable}`}>
            <thead><tr><th>Phạm vi</th><th className={styles.alignRight}>Ngân sách</th><th className={styles.alignRight}>Đã dùng tháng này</th><th>Ngưỡng</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead>
            <tbody>
              {budgets.map((budget) => {
                const status = statusById[budget.id];
                return (
                  <tr key={budget.id}>
                    <td>{budget.scope === 'global' ? 'Toàn ứng dụng' : `${budget.scope === 'key_alias' ? 'Key' : 'Người dùng'}: ${status?.scope_label || budget.scope_value}`}</td>
                    <td className={styles.numberCell}>{formatUsd(budget.monthly_limit_usd)}</td>
                    <td className={styles.numberCell}>{status ? `${formatUsd(status.spent_usd)} (${Number(status.percent).toLocaleString('vi-VN')}%)` : '—'}</td>
                    <td>{budget.alert_thresholds.join(' / ')}%</td>
                    <td>{!budget.active ? 'Tắt' : status?.level ? `Vượt ${status.level}%` : 'Bình thường'}</td>
                    <td className={styles.rowActions}>
                      <button type="button" onClick={() => onSave({ id: budget.id, active: !budget.active })} disabled={busy}>{budget.active ? 'Tắt' : 'Bật'}</button>
                      <button type="button" onClick={() => onDelete(budget.id)} disabled={busy}>Xóa</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <form className={us.formGrid} onSubmit={submit}>
        <label className={styles.modalField}>Phạm vi
          <select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })}>
            <option value="global">Toàn ứng dụng</option>
            <option value="key_alias">Theo key alias</option>
            <option value="user">Theo người dùng</option>
          </select>
        </label>
        {form.scope !== 'global' && (
          <label className={styles.modalField}>{form.scope === 'user' ? 'Email hoặc user ID' : 'Key alias'}
            <input type="text" value={form.scope_value} onChange={(event) => setForm({ ...form, scope_value: event.target.value })} />
          </label>
        )}
        <label className={styles.modalField}>Ngân sách / tháng (USD)
          <input type="number" min="0" step="0.01" className={styles.control} value={form.monthly_limit_usd} onChange={(event) => setForm({ ...form, monthly_limit_usd: event.target.value })} />
        </label>
        <label className={styles.modalField}>Ngưỡng cảnh báo (%)
          <input type="text" value={form.thresholds} onChange={(event) => setForm({ ...form, thresholds: event.target.value })} />
        </label>
        {error && <p className={us.fieldError} role="alert">{error}</p>}
        <div className={styles.modalActions}><button type="submit" className={styles.primary} disabled={busy}>Lưu ngân sách</button></div>
      </form>
    </section>
  );
}

function Prices({ prices, busy, onAdd }) {
  const empty = { model: '', service_tier: 'default', max_input_tokens: '', input: '', cached: '', cache_write: '', output: '', effective_from: '', version: '', source_url: '', backfill: false };
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const field = (key, label, props = {}) => (
    <label className={styles.modalField}>{label}
      <input className={styles.control} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} {...props} />
    </label>
  );
  const price = (value) => (value === null || value === undefined ? '—' : `$${Number(value)}`);

  return (
    <section className={styles.card} aria-labelledby="usage-price-title">
      <div className={styles.cardHead}>
        <h2 id="usage-price-title">Bảng giá model (USD / 1 triệu token)</h2>
        <button type="button" className={styles.actionButton} onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? 'Đóng' : 'Thêm giá mới'}</button>
      </div>
      <p className={us.muted}>Mỗi attempt giữ bản sao đơn giá lúc được tính, nên đổi giá không sửa lịch sử. Giá chỉ thêm mới cho thời điểm sau giá hiện tại; xác minh trên trang giá chính thức trước khi nhập.</p>
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${us.compactTable}`}>
          <thead><tr><th>Model</th><th>Tier</th><th>Input tối đa</th><th className={styles.alignRight}>Input</th><th className={styles.alignRight}>Cache đọc</th><th className={styles.alignRight}>Cache ghi</th><th className={styles.alignRight}>Output</th><th>Hiệu lực</th><th>Phiên bản</th></tr></thead>
          <tbody>
            {prices.map((row) => (
              <tr key={row.id}>
                <td>{row.provider}/{row.model}{row.match_snapshots && <small className={us.subline}>gồm bản -YYYY-MM-DD</small>}</td>
                <td>{row.service_tier}</td>
                <td>{row.max_input_tokens ? formatCount(row.max_input_tokens) : 'Không giới hạn'}</td>
                <td className={styles.numberCell}>{price(row.input_usd_per_mtok)}</td>
                <td className={styles.numberCell}>{price(row.cached_input_usd_per_mtok)}</td>
                <td className={styles.numberCell}>{price(row.cache_write_usd_per_mtok)}</td>
                <td className={styles.numberCell}>{price(row.output_usd_per_mtok)}</td>
                <td className={styles.dateCell}>{formatVnDateTime(row.effective_from)}{row.effective_to ? ` → ${formatVnDateTime(row.effective_to)}` : ''}</td>
                <td>{row.source_url ? <a href={row.source_url} target="_blank" rel="noopener noreferrer">{row.version}</a> : row.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <form className={us.formGrid} onSubmit={(event) => {
          event.preventDefault();
          onAdd({
            model: form.model.trim(),
            service_tier: form.service_tier.trim() || 'default',
            max_input_tokens: toIntOrNull(form.max_input_tokens),
            input_usd_per_mtok: Number(form.input),
            cached_input_usd_per_mtok: form.cached === '' ? null : Number(form.cached),
            cache_write_usd_per_mtok: form.cache_write === '' ? null : Number(form.cache_write),
            output_usd_per_mtok: Number(form.output),
            effective_from: form.effective_from ? new Date(form.effective_from).toISOString() : null,
            version: form.version.trim(),
            source_url: form.source_url.trim() || null,
            backfill_unpriced: form.backfill,
          }).then((saved) => { if (saved) { setForm(empty); setOpen(false); } });
        }}>
          {field('model', 'Model', { required: true, placeholder: 'gpt-6-luna' })}
          {field('service_tier', 'Service tier', { placeholder: 'default' })}
          {field('max_input_tokens', 'Áp dụng khi input ≤ (token, trống = mọi mức)', { type: 'number', min: 1 })}
          {field('input', 'Input', { type: 'number', min: 0, step: 'any', required: true })}
          {field('cached', 'Cache đọc', { type: 'number', min: 0, step: 'any' })}
          {field('cache_write', 'Cache ghi', { type: 'number', min: 0, step: 'any' })}
          {field('output', 'Output', { type: 'number', min: 0, step: 'any', required: true })}
          {field('effective_from', 'Hiệu lực từ (trống = ngay bây giờ)', { type: 'datetime-local' })}
          {field('version', 'Phiên bản giá', { required: true, maxLength: 64, placeholder: 'openai-pricing-2026-11-01' })}
          {field('source_url', 'Nguồn (https://…)', { type: 'url' })}
          <label className={styles.modalCheckbox}>
            <input type="checkbox" checked={form.backfill} onChange={(event) => setForm({ ...form, backfill: event.target.checked })} />
            Tính giá cho các attempt “chưa có giá” từ thời điểm hiệu lực (không đổi attempt đã có giá)
          </label>
          <div className={styles.modalActions}><button type="submit" className={styles.primary} disabled={busy}>Thêm giá</button></div>
        </form>
      )}
    </section>
  );
}
