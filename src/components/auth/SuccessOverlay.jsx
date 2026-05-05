export default function SuccessOverlay({ visible, message }) {
  if (!visible) {
    return null;
  }

  return (
    <div className="auth-success-overlay" aria-live="polite">
      <div className="auth-success-badge">✓</div>
      <p>{message}</p>
    </div>
  );
}
