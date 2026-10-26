import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { hasProAccess } from '../utils/userProfile.js';
import AccessGateModal from './auth/AccessGateModal.jsx';

/**
 * Inside a ProtectedRoute: only admins and Pro+ plans see `children`.
 * UI gate only — AI requests are still checked by the server.
 */
export default function ProPlanRoute({ children, title, description, backTo = '/', backLabel = 'Quay về trang chủ' }) {
  const { isProfileLoading, user, profile } = useAuth();
  const navigate = useNavigate();
  const hasCurrentProfile = Boolean(user?.id) && profile?.id === user.id;

  // Keep the page mounted during background revalidation (a running job must not be unmounted).
  if (isProfileLoading && !hasCurrentProfile) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-ring"></div>
        <p>Đang kiểm tra quyền truy cập...</p>
      </div>
    );
  }

  if (!hasCurrentProfile || !hasProAccess(profile)) {
    return (
      <AccessGateModal
        badge="Cần gói Pro"
        title={title}
        description={description}
        details={[]}
        primaryActionLabel={backLabel}
        secondaryActionLabel="Quay về trang chủ"
        onPrimaryAction={() => navigate(backTo, { replace: true })}
        onSecondaryAction={() => navigate('/', { replace: true })}
      />
    );
  }

  return children;
}
