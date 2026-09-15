import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import AccessGateModal from './auth/AccessGateModal.jsx';

export default function AdminRoute({ children }) {
  const { isAuthenticated, isInitializing, isProfileLoading, profile, logout } = useAuth();
  const navigate = useNavigate();

  if (isInitializing || isProfileLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-ring"></div>
        <p>Đang kiểm tra quyền truy cập...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AccessGateModal
        title="Khu vực quản trị cần đăng nhập."
        description="Trang quản trị chỉ dành cho tài khoản quản trị viên (role admin)."
        details={['Quản lý người dùng', 'Quản lý báo giá', 'Xem thống kê Watermark']}
        primaryActionLabel="Đăng nhập ngay"
        onPrimaryAction={() => navigate('/auth', { replace: true, state: { from: '/admin' } })}
        onSecondaryAction={() => navigate('/', { replace: true })}
      />
    );
  }

  if (profile?.status === 'suspended') {
    return (
      <AccessGateModal
        title="Tài khoản của bạn đã bị khóa."
        description="Tài khoản này đã bị quản trị viên tạm khóa nên không thể truy cập khu vực quản trị. Liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn."
        details={[]}
        primaryActionLabel="Đăng xuất"
        secondaryActionLabel="Quay về trang chủ"
        onPrimaryAction={async () => {
          await logout();
          navigate('/', { replace: true });
        }}
        onSecondaryAction={() => navigate('/', { replace: true })}
      />
    );
  }

  if (profile?.role !== 'admin') {
    return (
      <AccessGateModal
        title="Bạn không có quyền truy cập trang này."
        description="Tài khoản của bạn chưa được cấp quyền quản trị viên. Liên hệ quản trị viên hệ thống nếu bạn cần quyền này."
        details={[]}
        primaryActionLabel="Quay về trang chủ"
        secondaryActionLabel="Về Dashboard"
        onPrimaryAction={() => navigate('/', { replace: true })}
        onSecondaryAction={() => navigate('/dashboard/overview', { replace: true })}
      />
    );
  }

  return children;
}
