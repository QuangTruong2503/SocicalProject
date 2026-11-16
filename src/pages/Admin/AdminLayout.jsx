import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ZepLaoToolIcon, ZepLaoUIIcon } from '../../components/brand/ZepLaoBrand.jsx';
import styles from './Admin.module.css';

const NAV_ITEMS = [
  { to: '/admin', label: 'Tổng quan', icon: 'dashboard', end: true },
  { to: '/admin/users', label: 'Người dùng', icon: 'profile' },
  { to: '/admin/quotations', label: 'Báo giá', icon: 'quote' },
  { to: '/admin/usage', label: 'Thống kê & sử dụng', icon: 'dashboard' },
  { to: '/admin/memory-cards', label: 'Memory Game', icon: 'memory' },
  { to: '/admin/avatar-frames', label: 'Khung Avatar', icon: 'profile' },
  { to: '/admin/product-links', label: 'Link ảnh SP', icon: 'image-links' },
  { to: '/admin/notifications', label: 'Thông báo', icon: 'notification' },
];

export default function AdminLayout() {
  const navRef = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <h2 className="zl-admin-heading"><ZepLaoToolIcon name="admin" size={48} /> Quản trị</h2>
        <nav ref={navRef} className={styles.sidebarNav} aria-label="Điều hướng quản trị">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`}
            >
              <ZepLaoUIIcon name={item.icon} /> {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
