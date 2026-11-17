import { useEffect, useRef, useState } from 'react';
import { listUserHistory } from '../../services/userManagementService.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { Pagination } from './AdminTableParts.jsx';
import { formatDateTime } from './adminUtils.js';
import { formatChangeValue, getChangeFieldLabel } from './adminUserLabels.js';
import { HISTORY_ACTIONS, TOOL_LABELS, levelLabel } from './userManagementLabels.js';
import styles from './Admin.module.css';
import us from './AdminUsers.module.css';

function Values({ value }) {
  if (value == null) return <span>Không có / chưa được ghi trong lịch sử cũ</span>;
  const labels = { level: 'Quyền', daily_image_limit: 'Ảnh/ngày', monthly_image_limit: 'Ảnh/tháng', unlimited: 'Không giới hạn', note: 'Ghi chú' };
  return <span>{Object.entries(value).filter(([key]) => !['user_id','updated_at','updated_by'].includes(key)).map(([key,val]) => (
    <span key={key} className={us.historyValue}>{labels[key] || getChangeFieldLabel(key)}: {key === 'level' ? levelLabel(val) : val === null ? 'Kế thừa / không có' : typeof val === 'boolean' ? val ? 'Có' : 'Không' : formatChangeValue(key,val)}</span>
  ))}</span>;
}
export default function UserHistory({ userId, reloadToken, onOpenUser }) {
  const [search, setSearch] = useState('');
  const [actor, setActor] = useState('');
  const [target, setTarget] = useState('');
  const [kind, setKind] = useState('admin');
  const [tool, setTool] = useState('');
  const debounced = useDebouncedValue(search,300);
  const filterKey = JSON.stringify([debounced,actor,target,kind,tool,userId]);
  const [paging,setPaging] = useState({ key:filterKey,page:0 });
  const page = paging.key === filterKey ? paging.page : 0;
  const [state,setState] = useState({ rows:[],totalCount:0,loading:true,error:'' });
  const [reload,setReload] = useState(0);
  const requestRef = useRef(0);
  useEffect(() => {
    const request = ++requestRef.current;
    async function load() {
      setState((s) => ({ ...s,loading:true,error:'' }));
      const result = await listUserHistory({ search:debounced,actor,target,kind,tool,user:userId || '',limit:30,offset:page*30 });
      if (request !== requestRef.current) return;
      setState(result.error ? { rows:[],totalCount:0,loading:false,error:result.error } : { ...result.data,loading:false,error:'' });
    }
    load();
    return () => { requestRef.current += 1; };
  }, [debounced,actor,target,kind,tool,userId,page,reloadToken,reload]);
  const hasFilters = Boolean(search || actor || target || tool || kind !== 'admin');
  return <section aria-label={userId ? 'Lịch sử người dùng' : 'Nhật ký quản trị'}>
    <div className={styles.toolbar} role="search">
      <input type="search" className={styles.control} aria-label="Tìm nhật ký quản trị" placeholder="Tên, email, ID, ghi chú, mã lô…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {userId && <select aria-label="Nhóm lịch sử" className={styles.control} value={kind} onChange={(e) => setKind(e.target.value)}><option value="admin">Quản trị</option><option value="work">Công việc</option><option value="all">Tất cả</option></select>}
      <select aria-label="Công cụ trong nhật ký" className={styles.control} value={tool} onChange={(e) => setTool(e.target.value)}><option value="">Mọi công cụ</option>{Object.entries(TOOL_LABELS).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select>
      <input aria-label="ID người thực hiện" className={styles.control} placeholder="ID người thực hiện" value={actor} onChange={(e) => setActor(e.target.value)} />
      <input aria-label="ID người nhận thay đổi" className={styles.control} placeholder="ID người nhận thay đổi" value={target} onChange={(e) => setTarget(e.target.value)} />
      {hasFilters && <button type="button" className={styles.actionButton} onClick={() => { setSearch('');setActor('');setTarget('');setKind('admin');setTool(''); }}>Xóa bộ lọc</button>}
      <button type="button" className={styles.actionButton} onClick={() => setReload((n) => n+1)}>Làm mới lịch sử</button>
    </div>
    <p className={us.mutedNote}>Nhật ký tài khoản, quyền Link ảnh và hạn mức được đọc từ lịch sử gốc. Log copy chỉ giữ 14 ngày; không dùng lịch sử đã hết hạn để kết luận chưa từng hoạt động.</p>
    {state.loading ? <p role="status">Đang tải lịch sử…</p> : state.error ? <div className={styles.alert} role="alert">{state.error}<button type="button" onClick={() => setReload((n) => n+1)}>Thử lại</button></div>
      : <><p>{state.totalCount} kết quả sau lọc</p>{!state.rows.length ? <p>Chưa có bản ghi phù hợp trong dữ liệu đang lưu.</p> : <ol className={us.historyList}>{state.rows.map((entry) => <li key={entry.event_id}>
        <div className={us.auditMeta}><strong>{HISTORY_ACTIONS[entry.action] || entry.action} · {TOOL_LABELS[entry.tool] || entry.tool}</strong><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></div>
        <p>Người thực hiện: {entry.actor_id ? <button type="button" className={us.linkButton} onClick={() => onOpenUser?.(entry.actor_id)}>{entry.actor_name || entry.actor_id} · {entry.actor_email || entry.actor_id}</button> : entry.actor_email || 'Tài khoản đã xóa / không ghi nhận'}</p>
        <p>Đối tượng: {entry.target_id ? <button type="button" className={us.linkButton} onClick={() => onOpenUser?.(entry.target_id)}>{entry.target_name || entry.target_id} · {entry.target_email || entry.target_id}</button> : entry.target_name || 'Không có thông tin'}</p>
        {entry.kind === 'admin' && <div className={us.historyChanges}><div><small>Trước</small><Values value={entry.before_value} /></div><div><small>Sau</small><Values value={entry.after_value} /></div></div>}
        {entry.details?.item_code && <p>Sản phẩm: {entry.details.item_code}</p>}
        {entry.note && <p>Ghi chú: {entry.note}</p>}
        <small className={us.mutedNote}>Sự kiện {entry.event_id}{entry.batch_id ? ` · Lô ${entry.batch_id}` : ''}</small>
      </li>)}</ol>}<Pagination page={page} pageSize={30} totalCount={state.totalCount} onPageChange={(n) => setPaging({ key:filterKey,page:n })} /></>}
  </section>;
}
