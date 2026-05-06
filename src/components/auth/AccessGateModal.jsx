import { useEffect } from 'react';

export default function AccessGateModal({
  title,
  description,
  details = [],
  primaryActionLabel = 'Đăng nhập ngay',
  secondaryActionLabel = 'Quay về trang chủ',
  onPrimaryAction,
  onSecondaryAction,
}) {
  useEffect(() => {
    document.body.classList.add('auth-modal-open');

    return () => {
      document.body.classList.remove('auth-modal-open');
    };
  }, []);

  return (
    <div className="auth-access-backdrop" role="presentation">
      <section className="auth-access-modal" role="dialog" aria-modal="true" aria-labelledby="auth-access-title">
        <div className="auth-access-badge">Cần đăng nhập</div>
        <h1 id="auth-access-title">{title}</h1>
        <p>{description}</p>

        {details.length > 0 && (
          <ul className="auth-access-list">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}

        <div className="auth-access-actions">
          <button type="button" className="auth-access-primary" onClick={onPrimaryAction}>
            {primaryActionLabel}
          </button>
          <button type="button" className="auth-access-secondary" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
