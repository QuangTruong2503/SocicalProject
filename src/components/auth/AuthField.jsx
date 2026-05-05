export default function AuthField({
  id,
  type = 'text',
  label,
  value,
  onChange,
  error,
  disabled,
  autoComplete,
  showPasswordToggle = false,
  isPasswordVisible = false,
  onTogglePassword,
}) {
  const inputType = showPasswordToggle ? (isPasswordVisible ? 'text' : 'password') : type;

  return (
    <div className={`auth-field ${error ? 'has-error' : ''}`}>
      <div className="auth-input-wrap">
        <input
          id={id}
          className="auth-input"
          type={inputType}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder=" "
        />
        <label className="auth-label" htmlFor={id}>{label}</label>
        {showPasswordToggle && (
          <button
            type="button"
            className="auth-password-toggle"
            onClick={onTogglePassword}
            aria-label={isPasswordVisible ? 'An mat khau' : 'Hien mat khau'}
          >
            {isPasswordVisible ? '🙈' : '👁'}
          </button>
        )}
      </div>
      <div className={`auth-error ${error ? 'visible' : ''}`}>{error || ' '}</div>
    </div>
  );
}
