import { Navigate, useLocation } from 'react-router-dom';

/** Preserve bookmarks while keeping one canonical statistics page. */
export default function AdminUsageRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('tab', 'watermark');
  return <Navigate to={{ pathname: '/admin/usage', search: `?${params}` }} replace />;
}
