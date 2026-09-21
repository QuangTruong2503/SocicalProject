export function validateAuthForm(mode, form) {
  const errors = {};
  if (mode === 'register' && form.username.trim().length < 3) {
    errors.username = 'Tên hiển thị cần ít nhất 3 ký tự.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Vui lòng nhập địa chỉ email hợp lệ.';
  }
  if (!form.password) {
    errors.password = 'Vui lòng nhập mật khẩu.';
  } else if (mode === 'register' && form.password.length < 6) {
    errors.password = 'Mật khẩu cần ít nhất 6 ký tự.';
  }
  if (mode === 'register' && (!form.confirmPassword || form.confirmPassword !== form.password)) {
    errors.confirmPassword = 'Mật khẩu nhập lại chưa khớp.';
  }
  return errors;
}
