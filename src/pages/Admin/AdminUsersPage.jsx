import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaArrowsRotate, FaEllipsisVertical, FaFileCsv, FaXmark } from 'react-icons/fa6';
import { useAuth } from '../../hooks/useAuth.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { listManagedUsers, getUserCenterStats, saveManagedProfile, saveUserStatuses } from '../../services/userManagementService.js';
import ConfirmDialog from '../../components/dialog/ConfirmDialog.jsx';
import Dialog from '../../components/dialog/Dialog.jsx';
import UnsavedNavigationGuard from '../../components/dialog/UnsavedNavigationGuard.jsx';
import AdminUserAvatar from './AdminUserAvatar.jsx';
import AdminUserDrawer from './AdminUserDrawer.jsx';
import AdminUserEditModal from './AdminUserEditModal.jsx';
import UserPermissionForm from './UserPermissionForm.jsx';
import UserHistory from './UserHistory.jsx';
import { Pagination, SortHeader } from './AdminTableParts.jsx';
import { downloadCsv, formatDateTime, formatNumber, formatRelative } from './adminUtils.js';
import { PLAN_OPTIONS, ROLE_OPTIONS, STATUS_OPTIONS, getPlanLabel, getProfileName, getRoleLabel, getStatusLabel } from './adminUserLabels.js';
import { LEVEL_FILTERS, USER_TABS, levelLabel, sourceLabel, activityLabel } from './userManagementLabels.js';
import styles from './Admin.module.css';
import us from './AdminUsers.module.css';

const PAGE_SIZE=50;
const FILTER_KEYS=['search','role','status','verified','plan','level','quota'];
const FIELD_FILTERS=[
  { key:'role',label:'Vai trò',all:'Tất cả vai trò',options:ROLE_OPTIONS },
  { key:'status',label:'Trạng thái',all:'Tất cả trạng thái',options:STATUS_OPTIONS },
  { key:'verified',label:'Xác minh hồ sơ',all:'Xác minh hồ sơ: tất cả',options:[{ value:'true',label:'Đã xác minh hồ sơ' },{ value:'false',label:'Chưa xác minh hồ sơ' }] },
  { key:'plan',label:'Gói',all:'Tất cả gói',options:PLAN_OPTIONS },
  { key:'level',label:'Quyền Link ảnh',options:LEVEL_FILTERS },
  { key:'quota',label:'Ngoại lệ hạn mức',all:'Mọi hạn mức',options:[{ value:'override',label:'Có ngoại lệ hạn mức' },{ value:'default',label:'Mặc định của gói' }] },
];
function StatTile({ label,value,hint,onClick,active,loading }) {
  return <button type="button" className={`${styles.statCard} ${us.statButton} ${active ? us.statButtonActive : ''}`} onClick={onClick} aria-pressed={Boolean(active)}>
    <span>{label}</span>{loading ? <span className={styles.skeletonValue} /> : <strong>{value == null ? '—' : formatNumber(value)}</strong>}<small>{hint}</small>
  </button>;
}
function exportRows(rows) {
  downloadCsv(['Họ tên','Email','Vai trò','Trạng thái','Xác minh hồ sơ','Gói','Credits','Quyền trực tiếp','Quyền hiệu lực','Nguồn quyền','Đăng nhập gần nhất','Hoạt động gần nhất','Tham gia','ID'],
    rows.map((p) => [getProfileName(p),p.email,getRoleLabel(p.role),getStatusLabel(p.status),p.is_verified ? 'Có' : 'Không',getPlanLabel(p.plan),p.credits,levelLabel(p.direct_level),levelLabel(p.effective_level),sourceLabel(p),p.last_login_at,p.last_active_at,p.created_at,p.id]),
    `nguoi-dung-${new Date().toISOString().slice(0,10)}.csv`,{ neutralizeFormulas:true });
}

export default function AdminUsersPage() {
  const { user:currentUser }=useAuth();
  const [params,setParams]=useSearchParams();
  const tab=USER_TABS.some((t) => t.id===params.get('tab')) ? params.get('tab') : 'list';
  const permissions=tab==='permissions';
  const values=Object.fromEntries(FILTER_KEYS.map((key) => [key,params.get(key) || '']));
  const search=useDebouncedValue(values.search.trim(),300);
  const sort={ key:params.get('sort') || 'created_at',desc:params.get('desc') !== 'false' };
  const page=Math.max(0,Number.parseInt(params.get('page'),10) || 0);
  const filters={ ...values,search,sort:sort.key,desc:sort.desc };
  const filtersKey=JSON.stringify(filters);
  const selectedKey=`${filtersKey}|${page}|${tab}`;
  const [selection,setSelection]=useState({ key:selectedKey,ids:[] });
  const selectedIds=selection.key===selectedKey ? selection.ids : [];
  const [table,setTable]=useState({ rows:[],totalCount:0,loading:true,error:'' });
  const [stats,setStats]=useState({ data:null,error:'' });
  const [reload,setReload]=useState(0);
  const [editing,setEditing]=useState(null);
  const [saving,setSaving]=useState(false);
  const [editError,setEditError]=useState('');
  const [confirm,setConfirm]=useState(null);
  const [confirmBusy,setConfirmBusy]=useState(false);
  const [confirmError,setConfirmError]=useState('');
  const [permissionRows,setPermissionRows]=useState(null);
  const [permissionBusy,setPermissionBusy]=useState(false);
  const [exporting,setExporting]=useState(false);
  const permissionDirty=useRef(false);
  const selectAllRef=useRef(null);
  const tabRefs=useRef({});
  const requestRef=useRef(0);
  const savingRef=useRef(false);
  const userId=params.get('user');
  const detail=userId ? table.rows.find((row) => row.id===userId) || { id:userId } : null;
  const selectable=table.rows.filter((row) => permissions ? row.role!=='admin' : row.id!==currentUser?.id);
  const allSelected=selectable.length>0 && selectable.every((row) => selectedIds.includes(row.id));

  function patchParams(patch,replace=false) {
    setParams((current) => { const next=new URLSearchParams(current);Object.entries(patch).forEach(([key,value]) => {
      if (value === null || value === undefined || value === '') next.delete(key);else next.set(key,String(value));
    });return next; },{ replace });
  }
  function setFilter(key,value) { patchParams({ [key]:value,page:null },key==='search'); }
  function openUser(id,section='overview') { patchParams({ user:id,section }); }
  function closeUser() {
    const previousId=userId;
    patchParams({ user:null,section:null });
    window.requestAnimationFrame(() => {
      const trigger=[...document.querySelectorAll('[data-user-trigger]')].find((element) => element.dataset.userTrigger===previousId);
      (trigger || tabRefs.current[tab])?.focus();
    });
  }
  function refresh() { setReload((n) => n+1); }
  function select(ids) { setSelection({ key:selectedKey,ids }); }
  function clearFilters() { patchParams({ ...Object.fromEntries(FILTER_KEYS.map((key) => [key,null])),page:null }); }

  useEffect(() => {
    if (tab==='audit') return;
    const request=++requestRef.current;
    async function load() {
      setTable((s) => ({ ...s,loading:true,error:'' }));
      const result=await listManagedUsers({ ...JSON.parse(filtersKey),limit:PAGE_SIZE,offset:page*PAGE_SIZE });
      if (request!==requestRef.current) return;
      setTable(result.error ? { rows:[],totalCount:0,loading:false,error:result.error } : { ...result.data,loading:false,error:'' });
    }
    load();return () => { requestRef.current+=1; };
  },[filtersKey,page,reload,tab]);
  useEffect(() => {
    let active=true;
    getUserCenterStats().then((result) => { if (active) setStats({ data:result.data,error:result.error || '' }); });
    return () => { active=false; };
  },[reload]);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate=selectedIds.length>0 && !allSelected; },[selectedIds.length,allSelected]);
  useEffect(() => {
    const warn=(event) => { if (permissionDirty.current) { event.preventDefault();event.returnValue=''; } };
    window.addEventListener('beforeunload',warn);return () => window.removeEventListener('beforeunload',warn);
  },[]);

  async function saveEdit(updates) {
    if (savingRef.current) return;
    savingRef.current=true;setSaving(true);setEditError('');
    const result=await saveManagedProfile(editing.profile,updates);
    savingRef.current=false;setSaving(false);
    if (result.error) { setEditError(result.error);return; }
    toast.success('Đã cập nhật tài khoản.');setEditing(null);refresh();
  }
  async function applyStatus() {
    if (savingRef.current) return;
    savingRef.current=true;setConfirmBusy(true);setConfirmError('');
    const result=confirm.profile
      ? await saveManagedProfile(confirm.profile,{ status:confirm.status })
      : await saveUserStatuses(confirm.rows,confirm.status);
    savingRef.current=false;setConfirmBusy(false);
    if (result.error) { setConfirmError(result.error);return; }
    toast.success(confirm.profile ? 'Đã cập nhật trạng thái tài khoản.' : `Đã cập nhật ${result.data.updated_count} tài khoản.`);
    setConfirm(null);select([]);refresh();
  }
  async function exportCsv() {
    setExporting(true);const result=await listManagedUsers({ ...filters,limit:5000,offset:0 });setExporting(false);
    if (result.error) { toast.error(result.error);return; }
    exportRows(result.data.rows);
    if (result.data.totalCount>result.data.rows.length) toast.warning(`Chỉ xuất ${result.data.rows.length}/${result.data.totalCount} kết quả đầu tiên.`);
  }
  function edit(profile) { setEditError('');setEditing({ profile }); }
  function toggleLock(profile) { setConfirmError('');setConfirm({ profile,status:profile.status==='suspended' ? 'active' : 'suspended' }); }
  function closePermissionDialog() {
    if (permissionBusy) return;
    if (permissionDirty.current && !window.confirm('Có thay đổi quyền chưa lưu. Bỏ thay đổi?')) return;
    permissionDirty.current=false;setPermissionRows(null);
  }
  const statsData=stats.data;
  const hasFilters=FILTER_KEYS.some((key) => values[key]);
  const section=params.get('section') || 'overview';
  return <>
    <Helmet><title>Quản trị · Người dùng</title></Helmet>
    <header className={styles.pageHeader}><div><span>QUẢN TRỊ HỆ THỐNG</span><h1>NGƯỜI DÙNG</h1><p>Tài khoản, quyền công cụ và hạn mức tại một nơi.</p></div><div className={styles.headerActions}>
      <button type="button" className={styles.actionButton} onClick={refresh}><FaArrowsRotate aria-hidden="true" />Làm mới</button>
      {tab!=='audit' && <button type="button" className={styles.actionButton} onClick={exportCsv} disabled={exporting || table.loading}><FaFileCsv aria-hidden="true" />{exporting ? 'Đang xuất…' : 'Xuất CSV'}</button>}
    </div></header>
    <section className={styles.statGrid} aria-label="Tổng quan người dùng">
      <StatTile label="Tổng người dùng" value={statsData?.total} hint="Toàn hệ thống" loading={!statsData && !stats.error} onClick={clearFilters} />
      <StatTile label="Tài khoản hoạt động" value={statsData?.active} hint="Không bị khóa · bấm để lọc" loading={!statsData && !stats.error} active={values.status==='active'} onClick={() => setFilter('status','active')} />
      <StatTile label="Đã khóa" value={statsData?.suspended} hint="Không có quyền hiệu lực" loading={!statsData && !stats.error} active={values.status==='suspended'} onClick={() => setFilter('status','suspended')} />
      <StatTile label="Có quyền Link ảnh" value={statsData?.effective_access} hint={statsData ? `${statsData.direct_access} cấp trực tiếp · ${statsData.admin_access} kế thừa admin` : 'Mỗi tài khoản chỉ tính một lần'} loading={!statsData && !stats.error} active={values.level==='granted'} onClick={() => setFilter('level','granted')} />
      <StatTile label="Có ngoại lệ hạn mức" value={statsData?.quota_overrides} hint="Hạn mức AI cá nhân" loading={!statsData && !stats.error} active={values.quota==='override'} onClick={() => setFilter('quota','override')} />
    </section>
    {stats.error && <div className={styles.alert} role="alert">{stats.error}</div>}
    <div className={us.userTabs} role="tablist" aria-label="Trung tâm Người dùng" onKeyDown={(e) => {
      const index=USER_TABS.findIndex((t) => t.id===tab);const step=e.key==='ArrowRight' ? 1 : e.key==='ArrowLeft' ? -1 : 0;
      const next=e.key==='Home' ? USER_TABS[0] : e.key==='End' ? USER_TABS.at(-1) : step ? USER_TABS[(index+step+USER_TABS.length)%USER_TABS.length] : null;
      if (next) { e.preventDefault();patchParams({ tab:next.id });tabRefs.current[next.id]?.focus(); }
    }}>{USER_TABS.map((t) => <button type="button" role="tab" id={`user-tab-${t.id}`} aria-controls={`user-panel-${t.id}`} key={t.id} ref={(el) => { tabRefs.current[t.id]=el; }} aria-selected={tab===t.id} tabIndex={tab===t.id ? 0 : -1} onClick={() => patchParams({ tab:t.id,...(t.id==='permissions' ? { tool:'product-links' } : {}) })}>{t.label}</button>)}</div>
    <section role="tabpanel" id={`user-panel-${tab}`} aria-labelledby={`user-tab-${tab}`} className={styles.card}>
      {tab==='audit' ? <UserHistory reloadToken={reload} onOpenUser={(id) => openUser(id)} /> : <>
        {permissions && <div className={us.tabIntro}><h2>Phân quyền · Link ảnh sản phẩm</h2><p>Dùng chung nguồn tài khoản và quyền với Danh sách người dùng. Admin kế thừa toàn quyền; tài khoản khóa luôn bị chặn.</p></div>}
        <div className={styles.toolbar} role="search">
          <input type="search" className={`${styles.control} ${styles.search}`} value={values.search} placeholder="Tên, tên đăng nhập, email hoặc ID…" aria-label="Tìm người dùng" onChange={(e) => setFilter('search',e.target.value)} />
          {FIELD_FILTERS.map((f) => <select key={f.key} className={styles.control} aria-label={f.label} value={values[f.key]} onChange={(e) => setFilter(f.key,e.target.value)}>
            {f.all && <option value="">{f.all}</option>}{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>)}
          {hasFilters && <button type="button" className={styles.actionButton} onClick={clearFilters}><FaXmark aria-hidden="true" />Xóa bộ lọc</button>}
        </div>
        <div className={us.listMeta}>{table.loading ? 'Đang tải…' : `${formatNumber(table.totalCount)} kết quả sau lọc`}
          {selectedIds.length>0 && <div className={us.bulkBar}><strong>Đã chọn {selectedIds.length} tài khoản trên trang hiện tại</strong>
            {permissions ? <button type="button" className={styles.actionButton} onClick={() => { permissionDirty.current=false;setPermissionRows(table.rows.filter((p) => selectedIds.includes(p.id))); }}>Cấp / thu hồi quyền đã chọn</button>
              : <><button type="button" className={styles.actionButton} onClick={() => { setConfirmError('');setConfirm({ status:'suspended',rows:table.rows.filter((p) => selectedIds.includes(p.id)) }); }}>Khóa đã chọn</button><button type="button" className={styles.actionButton} onClick={() => { setConfirmError('');setConfirm({ status:'active',rows:table.rows.filter((p) => selectedIds.includes(p.id)) }); }}>Mở khóa đã chọn</button></>}
            <button type="button" className={us.linkButton} onClick={() => select([])}>Bỏ chọn</button></div>}
        </div>
        {table.error && <div className={styles.alert} role="alert">{table.error}<button type="button" onClick={refresh}>Thử lại</button></div>}
        <div className={styles.tableWrap} aria-busy={table.loading}><table className={`${styles.table} ${us.usersTable}`}><thead><tr>
          <th className={us.checkCell}><input ref={selectAllRef} type="checkbox" checked={allSelected} disabled={!selectable.length || table.loading} onChange={() => select(allSelected ? [] : selectable.map((p) => p.id))} aria-label="Chọn tất cả trên trang hiện tại" /></th>
          <SortHeader label="Người dùng" sortKey="name" sort={sort} onSort={(key) => patchParams({ sort:key,desc:sort.key===key ? !sort.desc : false,page:null })} />
          <th>Trạng thái</th><th>Vai trò</th><th>Gói</th>
          <SortHeader label="Quyền Link ảnh" sortKey="level" sort={sort} onSort={(key) => patchParams({ sort:key,desc:sort.key===key ? !sort.desc : true,page:null })} />
          <SortHeader label="Hoạt động gần nhất" sortKey="last_active_at" sort={sort} onSort={(key) => patchParams({ sort:key,desc:sort.key===key ? !sort.desc : true,page:null })} />
          <th>Thao tác</th>
        </tr></thead><tbody>
          {table.loading ? <tr><td colSpan={8} role="status">Đang tải tài khoản và quyền…</td></tr> : table.rows.length===0 && !table.error ? <tr><td colSpan={8} className={styles.emptyState}>Không có người dùng phù hợp với bộ lọc.</td></tr> : table.rows.map((row) => {
            const self=row.id===currentUser?.id;const disabled=permissions ? row.role==='admin' : self;const name=getProfileName(row);
            return <tr key={row.id} className={selectedIds.includes(row.id) ? us.rowSelected : undefined}>
              <td className={us.checkCell}><input type="checkbox" checked={selectedIds.includes(row.id)} disabled={disabled} title={disabled ? permissions ? 'Kế thừa quyền admin; quản lý qua vai trò' : 'Không thể tự khóa tài khoản' : undefined} aria-label={`Chọn ${name}`} onChange={() => select(selectedIds.includes(row.id) ? selectedIds.filter((id) => id!==row.id) : [...selectedIds,row.id])} /></td>
              <td className={us.identityCell}><button type="button" data-user-trigger={row.id} className={us.userCell} aria-label={`Xem chi tiết ${name}`} onClick={() => openUser(row.id,permissions ? 'permissions' : 'overview')}><AdminUserAvatar profile={row} /><span><strong title={name}>{name}{self && <small className={us.selfBadge}>Bạn</small>}</strong><small title={row.email}>{row.email || row.username || row.id}</small></span></button></td>
              <td><span className={`${styles.badge} ${row.status==='suspended' ? styles.badgeSuspended : styles.badgeActive}`}>{getStatusLabel(row.status)}</span></td>
              <td><span className={styles.badge}>{getRoleLabel(row.role)}</span></td>
              <td>{getPlanLabel(row.plan)}{row.has_quota_override && <small className={us.historyValue}>Có ngoại lệ AI</small>}</td>
              <td className={us.permissionCell}><button type="button" className={us.permissionLink} onClick={() => openUser(row.id,'permissions')}><strong>{levelLabel(row.effective_level)}</strong><small>{sourceLabel(row)}</small>{permissions && <small>Đã cấp: {levelLabel(row.direct_level)}</small>}</button></td>
              <td className={`${styles.dateCell} ${us.activityCell}`}>{row.last_active_at ? <time dateTime={row.last_active_at} title={formatDateTime(row.last_active_at)}>{formatRelative(row.last_active_at)}<small>{formatDateTime(row.last_active_at)}</small></time> : activityLabel(row,formatRelative)}</td>
              <td className={us.actionsCell}><details className={us.rowMenu}><summary aria-label={`Thao tác với ${name}`}><FaEllipsisVertical aria-hidden="true" /><span>Thao tác</span></summary><div>
                <button type="button" onClick={() => openUser(row.id)}>Xem hồ sơ</button><button type="button" onClick={() => openUser(row.id,'permissions')}>Quyền công cụ</button><button type="button" onClick={() => openUser(row.id,'quota')}>Gói & hạn mức</button>
                <button type="button" disabled={self} onClick={() => edit(row)}>Chỉnh sửa tài khoản</button><button type="button" className={us.dangerAction} disabled={self} onClick={() => toggleLock(row)}>{row.status==='suspended' ? 'Mở khóa' : 'Khóa tài khoản'}</button>
              </div></details></td>
            </tr>;
          })}
        </tbody></table></div>
        <Pagination page={page} pageSize={PAGE_SIZE} totalCount={table.totalCount} disabled={table.loading} onPageChange={(n) => patchParams({ page:n })} />
      </>}
    </section>
    {detail && !editing && !confirm && !permissionRows && <AdminUserDrawer key={detail.id} summary={detail} isSelf={detail.id===currentUser?.id} section={section} onSectionChange={(id) => patchParams({ section:id })} onClose={closeUser} onEdit={edit} onToggleLock={toggleLock} onChanged={refresh} onOpenUser={(id) => openUser(id)} reloadToken={reload} />}
    {editing && <AdminUserEditModal key={JSON.stringify(editing.profile)} profile={editing.profile} saving={saving} error={editError} onSave={saveEdit} onCancel={() => setEditing(null)} onReload={async () => { if (!window.confirm('Tải lại sẽ bỏ bản nháp tài khoản hiện tại. Tiếp tục?')) return;const result=await listManagedUsers({ user:editing.profile.id });if (result.error) { setEditError(result.error);return; }if (!result.data.rows.length) { setEditError('Tài khoản không còn tồn tại.');return; }setEditing({ profile:result.data.rows[0] });setEditError('');refresh(); }} />}
    {confirm && <ConfirmDialog title={confirm.status==='suspended' ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?'} message={`${confirm.profile ? getProfileName(confirm.profile) : `${selectedIds.length} tài khoản đã chọn trên trang này`}. ${confirm.status==='suspended' ? 'Mọi quyền công cụ sẽ bị chặn; quyền đã cấp vẫn được giữ.' : 'Quyền đã cấp sẽ có hiệu lực trở lại.'}${confirmError ? ` Lỗi: ${confirmError}` : ''}`} confirmLabel="Xác nhận" danger={confirm.status==='suspended'} busy={confirmBusy} onConfirm={applyStatus} onCancel={() => setConfirm(null)} />}
    {permissionRows && <Dialog title="Phân quyền Link ảnh đã chọn" variant="wide" busy={permissionBusy} onClose={closePermissionDialog}><UnsavedNavigationGuard dirtyRef={permissionDirty} busy={permissionBusy} onDiscard={() => setPermissionRows(null)} /><UserPermissionForm rows={permissionRows} onBusyChange={setPermissionBusy} onReload={() => { closePermissionDialog();refresh(); }} onDirtyChange={(v) => { permissionDirty.current=v; }} onCancel={() => { permissionDirty.current=false;setPermissionRows(null); }} onSaved={() => { permissionDirty.current=false;setPermissionRows(null);select([]);refresh(); }} /></Dialog>}
  </>;
}
