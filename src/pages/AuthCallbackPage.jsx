import { Helmet } from 'react-helmet-async';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { normalizeLocalPath } from '../utils/authRedirect.js';

export default function AuthCallbackPage() {
  const { isAuthenticated, isInitializing } = useAuth();
  const [searchParams] = useSearchParams();

  const nextPath = normalizeLocalPath(searchParams.get('next'));

  if (isInitializing) {
    return (
      <>
        <Helmet>
          <title>Đang hoàn tất đăng nhập - AISEO Tools Suite</title>
        </Helmet>

        <div className="auth-loading-screen">
          <div className="auth-loading-ring"></div>
          <p>Đang hoàn tất xác thực…</p>
        </div>
      </>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={nextPath} replace />;
  }

  return <Navigate to={`/auth?next=${encodeURIComponent(nextPath)}`} replace state={{
    authNotice: 'Chưa thể hoàn tất xác thực. Liên kết có thể đã hết hạn hoặc bị hủy. Vui lòng thử đăng nhập lại.',
  }} />;
}
