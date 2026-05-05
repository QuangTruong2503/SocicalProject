export default function AuthToast({ toast }) {
  if (!toast) {
    return null;
  }

  return (
    <div className={`auth-toast auth-toast-${toast.type}`}>
      <div className="auth-toast-icon">{toast.type === 'success' ? '✓' : '!'}</div>
      <div>
        <strong>{toast.title}</strong>
        <p>{toast.message}</p>
      </div>
    </div>
  );
}
