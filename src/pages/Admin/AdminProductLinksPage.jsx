import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { FaArrowUpRightFromSquare } from 'react-icons/fa6';
import { getAdminProductLinkStats } from '../../services/productLinkService.js';
import { getUserCenterStats } from '../../services/userManagementService.js';
import ProductLinkLogsTab from './ProductLinkLogsTab.jsx';
import { formatNumber } from './adminUtils.js';
import styles from './Admin.module.css';

function StatTile({ label,value,hint }) { return <article className={styles.statCard}><span>{label}</span><strong>{value == null ? '—' : formatNumber(value)}</strong><small>{hint}</small></article>; }
export default function AdminProductLinksPage() {
  const [params]=useSearchParams();
  const [state,setState]=useState({ data:null,access:null,error:'' });
  const [reload,setReload]=useState(0);
  useEffect(() => {
    let active=true;
    Promise.all([getAdminProductLinkStats(),getUserCenterStats()]).then(([stats,access]) => {
      if (active) setState({ data:stats.data,access:access.data,error:stats.error || access.error || '' });
    });
    return () => { active=false; };
  },[reload]);
  if (params.get('tab')==='permissions') {
    const next=new URLSearchParams(params);next.set('tab','permissions');next.set('tool','product-links');
    if (next.has('q') && !next.has('search')) { next.set('search',next.get('q'));next.delete('q'); }
    return <Navigate replace to={`/admin/users?${next}`} />;
  }
  const data=state.data;
  return <>
    <Helmet><title>Quản trị · Link ảnh sản phẩm</title></Helmet>
    <header className={styles.pageHeader}><div><span>QUẢN TRỊ HỆ THỐNG</span><h1>LINK ẢNH SẢN PHẨM</h1></div><div className={styles.headerActions}>
      <Link to="/admin/users?tab=permissions&tool=product-links" className={styles.actionButton}>Quản lý quyền</Link>
      <Link to="/link-anh-san-pham" className={styles.actionButton}><FaArrowUpRightFromSquare aria-hidden="true" />Mở trang</Link>
    </div></header>
    <section className={styles.statGrid} aria-label="Tổng quan Link ảnh sản phẩm">
      <StatTile label="Sản phẩm" value={data?.items_total} hint={data ? `${formatNumber(data.items_done)} hoàn thành (${data.items_total ? Math.round(data.items_done/data.items_total*100) : 0}%)` : 'Đang tải tiến độ'} />
      <StatTile label="Đang ghim" value={data?.items_pinned} hint="Chưa hoàn thành" />
      <StatTile label="Có quyền Link ảnh" value={state.access?.effective_access} hint={state.access ? `${state.access.direct_access} cấp trực tiếp · ${state.access.admin_access} kế thừa admin; không tính tài khoản khóa` : 'Đang tải quyền hiệu lực'} />
      <StatTile label="Hoạt động 7 ngày" value={data?.actions_7d} hint={data ? `${formatNumber(data.active_users_7d)} người · ${formatNumber(data.copies_7d)} lượt copy` : 'Đang tải hoạt động'} />
    </section>
    {state.error && <div role="alert" className={styles.alert}>{state.error}<button type="button" onClick={() => setReload((n) => n+1)}>Thử lại</button></div>}
    {state.access?.suspended_with_access>0 && <p>{state.access.suspended_with_access} tài khoản khóa có quyền đã cấp nhưng không có hiệu lực. <Link to="/admin/users?tab=permissions&tool=product-links&status=suspended">Xem tài khoản khóa</Link></p>}
    <h2>Nhật ký công việc</h2>
    <ProductLinkLogsTab workOnly retentionDays={data?.copy_retention_days ?? 14} onChanged={() => setReload((n) => n+1)} />
  </>;
}
