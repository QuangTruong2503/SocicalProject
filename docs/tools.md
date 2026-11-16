# Tools

Danh sách công cụ tại `/tools`, theo giao diện `genesis-DESIGN.md`.

- Clear Video: `/tools/clear-video`.
- Watermark: `/tools/watermark`, cần đăng nhập.
- Watermark tự động: `/tools/watermark/auto`, cần đăng nhập và gói Pro/Enterprise hoặc quyền admin.

`/watermark` và `/watermark/auto` chuyển hướng sang URL mới, thay thế mục lịch sử hiện tại và giữ query, fragment, location state. Các liên kết trong ứng dụng và đường dẫn quay lại sau đăng nhập dùng URL mới.

`/watermark/dashboard` và `/admin/watermark` tiếp tục chuyển về trang thống kê `/admin/usage?tab=watermark`. Các mã nguồn thống kê `watermark` và `watermark/auto`, dữ liệu và cài đặt đã lưu giữ nguyên.

Danh mục và thông tin hiển thị của công cụ nằm trong `src/pages/Tools/toolCatalog.js`. Chạy `npm run test:tools` để kiểm tra danh sách, Clear Video và chuyển hướng Watermark.
