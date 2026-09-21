import { FiEye, FiEyeOff } from 'react-icons/fi';

export default function AuthField({
  id,
  name,
  type = 'text',
  label,
  value,
  onChange,
  error,
  disabled,
  autoComplete,
  hint,
  placeholder = '',
  showPasswordToggle = false,
  isPasswordVisible = false,
  onTogglePassword,
}) {
  const inputType = showPasswordToggle ? (isPasswordVisible ? 'text' : 'password') : type;

  return (
    <div className={`auth-field ${error ? 'has-error' : ''}`}>
      <label className="auth-label" htmlFor={id}>{label}</label>
      <div className="auth-input-wrap">
        <input
          id={id}
          name={name || id}
          className="auth-input"
          type={inputType}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />
        {showPasswordToggle && (
          <button
            type="button"
            className="auth-password-toggle"
            onClick={onTogglePassword}
            disabled={disabled}
            aria-label={isPasswordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            aria-pressed={isPasswordVisible}
          >
            {isPasswordVisible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
          </button>
        )}
      </div>
      {error ? <p id={`${id}-error`} className="auth-error visible" role="alert">{error}</p>
        : hint ? <p id={`${id}-hint`} className="auth-field-hint">{hint}</p> : null}
    </div>
  );
}
