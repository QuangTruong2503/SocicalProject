import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import AccessGateModal from './auth/AccessGateModal.jsx';
import { normalizeLocalPath } from '../utils/authRedirect.js';

export default function ProtectedRoute({
  children,
  title = 'Trang này chỉ dành cho thành viên đăng nhập.',
  description = 'Bạn đang truy cập một khu vực cần xác thực. Hãy đăng nhập để tiếp tục sử dụng toàn bộ tính năng.',
  details = ['Xem dashboard cá nhân', 'Đồng bộ hồ sơ và ảnh tải lên', 'Bảo vệ dữ liệu riêng tư'],
  loginLabel = 'Đăng nhập ngay',
}) {
  const { isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const returnPath = normalizeLocalPath(
    `${location.pathname}${location.search}${location.hash}`,
    '/dashboard',
  );

  if (isInitializing) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-ring"></div>
        <p>Đang khôi phục phiên đăng nhập...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AccessGateModal
        title={title}
        description={description}
        details={details}
        primaryActionLabel={loginLabel}
        secondaryActionLabel="Quay về trang chủ"
        onPrimaryAction={() => navigate('/auth', { replace: true, state: { from: returnPath } })}
        onSecondaryAction={() => navigate('/', { replace: true })}
      />
    );
  }

  return children;
}
