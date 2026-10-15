# Thông báo đến người dùng

## Cài đặt database

Chạy `supabase/migrations/20261015025117_user_notifications.sql` trên Supabase SQL Editor của dự án đích, sau `supabase_admin_profiles_policies.sql`. Migration có thể chạy lại. Không cần sửa migration Memory Game.

Giữ schema `notification_private` ngoài danh sách schema được Data API expose. Chỉ các RPC `public.notification_*` và `public.admin_notification_*` được gọi từ trình duyệt; các wrapper chạy với `security invoker`, phần đặc quyền nằm trong schema riêng và kiểm tra tài khoản/quyền admin từ database ở mỗi lần gọi. Client không có quyền truy cập trực tiếp hai bảng thông báo và người nhận.

Migration thêm policy nhận Broadcast trên topic riêng `notifications:<auth.uid()>`. Policy chỉ cho phép tài khoản đang hoạt động nhận tín hiệu trên topic của chính mình. Payload không chứa nội dung hay dữ liệu người dùng. Không cần thêm các bảng vào publication Postgres Changes và không thay đổi cài đặt public channel đang dùng cho Watermark. Có polling dự phòng mỗi 30 giây khi tab hiển thị, cập nhật khi focus và khi kết nối lại. Lỗi phát Broadcast không làm thất bại thao tác gửi/đọc.

Repository hiện không có Supabase local đang chạy; migration được kiểm thử bằng PostgreSQL nhúng PGlite và chưa được áp dụng lên môi trường thật. Sau khi áp dụng, kiểm tra với hai tài khoản khác nhau trên hai cửa sổ/thiết bị, gồm gửi, xác nhận, đồng bộ và thu hồi. Kiểm tra các policy Broadcast khác trên môi trường đích không cấp quyền nhận topic thông báo của người khác.

## Sử dụng

- Admin mở `/admin/notifications`: soạn tiêu đề, nội dung văn bản, mức độ, ảnh HTTPS tùy chọn, liên kết nội bộ/HTTPS và nhãn nút tùy chọn.
- Gửi tất cả tài khoản đang hoạt động hoặc tìm/chọn từng người. Danh sách người nhận được chốt tại thời điểm gửi; tài khoản tạo sau đó không nhận lại thông báo cũ. Tài khoản bị khóa bị loại lúc gửi và không thể gọi các RPC.
- Có lưu/chỉnh sửa bản nháp, xem trước, xác nhận gửi, lịch sử phân trang, thống kê người nhận/đã đọc/đã xác nhận và thu hồi. Nội dung đã gửi không được chỉnh sửa; có thể thu hồi rồi soạn thông báo mới. Gửi lại cùng ID không tạo thêm người nhận.
- User đã đăng nhập xem chuông trên Header hoặc `/notifications`, lọc tất cả/chưa đọc, xem nội dung đầy đủ và đánh dấu đọc. Trạng thái lưu theo tài khoản trong database, không dùng localStorage.
- **Bình thường:** chỉ vào chuông/hộp thư, không tự mở modal.
- **Quan trọng:** vào cả hộp thư và hàng đợi modal trên toàn website sau khi khôi phục phiên đăng nhập; hiển thị lần lượt theo thời điểm gửi. Khi đang mở website, thông báo mới cũng được cập nhật. Chỉ nút **Đã hiểu** ghi nhận xác nhận, không đóng bằng Escape hoặc bấm nền. Xác nhận thành công thì không tự hiện lại trên thiết bị khác. Liên kết hành động không tự xác nhận.
- **Đọc tất cả** chỉ đánh dấu các thông báo bình thường. Đánh dấu đã đọc một thông báo quan trọng cũng không thay thế việc bấm **Đã hiểu**.
- Thu hồi gỡ khỏi hộp thư, hàng đợi modal và chi tiết đang mở khi dữ liệu được cập nhật, đồng thời giữ thống kê đã có cho admin.

## Kiểm tra

`npm run test:notifications` kiểm tra SQL thật trong PGlite (phân quyền, cô lập tài khoản, người nhận, gửi lặp, xác nhận và thu hồi) và các component React trong jsdom với transport giả lập, không dùng thông tin đăng nhập hoặc kết nối database thật.

`npm run lint` và `npm run build` kiểm tra mã nguồn/build. Các kiểm thử Memory Game hiện có vẫn chạy độc lập qua `npm run test:memory` và `npm run test:memory:ui`.
