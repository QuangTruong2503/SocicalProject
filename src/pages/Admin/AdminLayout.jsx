import { NavLink, Outlet } from 'react-router-dom';
import { FaChartPie, FaDroplet, FaFileInvoiceDollar, FaImages, FaUsers } from 'react-icons/fa6';
import styles from './Admin.module.css';

const NAV_ITEMS = [
  { to: '/admin', label: 'Tổng quan', icon: <FaChartPie />, end: true },
  { to: '/admin/users', label: 'Người dùng', icon: <FaUsers /> },
  { to: '/admin/quotations', label: 'Báo giá', icon: <FaFileInvoiceDollar /> },
  { to: '/admin/watermark', label: 'Watermark', icon: <FaDroplet /> },
  { to: '/admin/memory-cards', label: 'Memory Game', icon: <FaImages /> },
];

export default function AdminLayout() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <h2>Quản trị</h2>
        <nav className={styles.sidebarNav}>
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
