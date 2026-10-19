import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { FaBell, FaChartLine, FaChartPie, FaFileInvoiceDollar, FaImages, FaLink, FaUsers } from 'react-icons/fa6';
import styles from './Admin.module.css';

const NAV_ITEMS = [
  { to: '/admin', label: 'Tổng quan', icon: <FaChartPie />, end: true },
  { to: '/admin/users', label: 'Người dùng', icon: <FaUsers /> },
  { to: '/admin/quotations', label: 'Báo giá', icon: <FaFileInvoiceDollar /> },
  { to: '/admin/usage', label: 'Thống kê & sử dụng', icon: <FaChartLine /> },
  { to: '/admin/memory-cards', label: 'Memory Game', icon: <FaImages /> },
  { to: '/admin/product-links', label: 'Link ảnh SP', icon: <FaLink /> },
  { to: '/admin/notifications', label: 'Thông báo', icon: <FaBell /> },
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
        <h2>Quản trị</h2>
        <nav ref={navRef} className={styles.sidebarNav} aria-label="Điều hướng quản trị">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`}
            >
              {item.icon} {item.label}
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
