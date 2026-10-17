import { AI_NAMING_ACCESS_DENIED_MESSAGE } from '../services/imageNameService.js';

/**
 * Copy for each access state of "Đặt tên AI". There is no upgrade/checkout
 * page in the project, so the "denied" state offers no upgrade link.
 *
 * @param {'loading' | 'allowed' | 'denied' | 'signed_out' | 'error'} status
 * @param {string | null} [error]
 */
export function describeAiNamingAccess(status, error) {
  switch (status) {
    case 'loading':
      return { title: 'Đang kiểm tra quyền…', message: 'Đang kiểm tra quyền sử dụng Đặt tên AI.' };
    case 'signed_out':
      return {
        title: 'Cần đăng nhập',
        message: 'Đăng nhập để dùng Đặt tên AI.',
        note: 'Ảnh và kết quả chưa tải xuống trên trang này sẽ mất khi chuyển sang trang đăng nhập.',
      };
    case 'denied':
      return {
        title: 'Tính năng dành cho tài khoản Pro',
        message: AI_NAMING_ACCESS_DENIED_MESSAGE,
        note: 'Bạn vẫn có thể đổi tên thủ công hoặc dùng “Thêm tên ảnh hàng loạt”.',
      };
    case 'error':
      return { title: 'Chưa kiểm tra được quyền', message: error || 'Không kiểm tra được quyền sử dụng. Vui lòng thử lại sau.' };
    default:
      return null;
  }
}
