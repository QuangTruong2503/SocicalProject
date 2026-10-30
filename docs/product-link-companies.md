# Link ảnh sản phẩm theo công ty

Trang `/link-anh-san-pham` có bộ chọn công ty. Mặc định mở Minh Triết; URL `?company=<uuid>` mở trực tiếp công ty tương ứng. Mỗi công ty có danh sách sản phẩm, trạng thái hoàn thành, ghim, ghi chú, thống kê và nhật ký riêng. Chuyển công ty đặt lại tìm kiếm, bộ lọc và các thẻ đang mở.

Admin dùng **Thêm công ty** ngay trên trang. Tên không được để trống, tối đa 100 ký tự, bỏ khoảng trắng thừa và không trùng tên đã có (không phân biệt hoa thường). Sau khi tạo, trang tự chuyển sang công ty mới. Người dùng khác tải lại trang để lấy danh sách công ty mới.

Quyền viewer/checker/editor hiện tại tiếp tục áp dụng cho mọi công ty; tính năng này không tạo quyền truy cập riêng theo công ty. Chỉ admin đang hoạt động được tạo công ty, được kiểm tra bằng RLS trong database.

Nút **Tải Excel** xuất toàn bộ sản phẩm của công ty đang chọn, bao gồm sản phẩm đã làm và các sản phẩm ngoài kết quả tìm kiếm/bộ lọc hoặc chưa hiển thị do phân trang. Mỗi sản phẩm một dòng với mã sản phẩm dạng văn bản và các cột `Link ảnh 1`, `Link ảnh 2`, …; link ảnh có thể bấm để mở. Tên file chứa tên công ty. Nút bị vô hiệu hóa khi đang tải, tải lỗi hoặc công ty chưa có sản phẩm. Mọi người có quyền xem trang đều có thể tải Excel.

## Áp dụng database

Nếu dự án đã có Link ảnh sản phẩm, chạy toàn bộ [`20261024084036_product_link_companies.sql`](../supabase/migrations/20261024084036_product_link_companies.sql) trong Supabase SQL Editor trước khi triển khai frontend. Với dự án mới, chạy `supabase_product_links.sql`, `supabase_product_links_admin.sql`, rồi migration này. Không chạy lại hai SQL gốc sau migration vì chúng chứa index và RPC dành cho danh sách dùng chung.

Migration có transaction và chạy lại được. Tạo sẵn Minh Triết, Minh Tâm; toàn bộ sản phẩm và nhật ký cũ chuyển về Minh Triết mà giữ nguyên ID, link, ghi chú, trạng thái và thời gian. Nhật ký cấp/thu hồi quyền vẫn dùng chung và chỉ admin thấy.

Mã sản phẩm chỉ cần duy nhất trong cùng công ty. Nhập dữ liệu với chế độ gộp/thay/bỏ qua chỉ tìm sản phẩm trong công ty đã chọn. RPC cũ gọi bằng hai tham số vẫn mặc định ghi vào Minh Triết. Nhật ký từ trigger và thao tác copy lưu `company_id`, kể cả sau khi sản phẩm bị xóa. Không hỗ trợ chuyển sản phẩm sang công ty khác bằng UPDATE.

Chưa áp dụng migration vào Supabase thật trong lượt sửa mã này vì workspace chưa có kết nối quản trị database. Không cần thêm biến môi trường hay secrets cho frontend. Khi thiếu bảng mới, trang báo chưa cập nhật dữ liệu công ty và có nút thử lại.

## Kiểm tra

Chạy `npm run test:product-links`, `npm run lint` và `npm run build`.

SQL được kiểm tra trong Postgres nhúng PGlite với schema gốc, bao gồm bảo toàn dữ liệu cũ, chạy lại migration, quyền admin/nhân viên/viewer/ẩn danh/tài khoản bị khóa, mã trùng giữa công ty, các chế độ import, chống chuyển công ty qua UPDATE và nhật ký copy/ghim/hoàn thành/xóa.

Kiểm thử React trong jsdom dùng service thật với transport giả lập: chọn công ty từ URL, chuyển công ty, đặt lại tìm kiếm, phản hồi trễ, sự kiện realtime từ công ty khác, tạo công ty, lỗi trùng tên và lỗi thiếu schema. Sau khi triển khai cần kiểm tra realtime thực tế bằng hai tài khoản trên Supabase.
