# Quản lý báo giá `/admin/quotations`

## Những lỗi đã sửa

- Kết quả tìm kiếm hoặc đổi loại trả về chậm có thể ghi đè danh sách mới, thậm chí tạo liên kết sai loại báo giá. Mỗi yêu cầu được hủy khi bộ lọc đổi; dữ liệu cũ được ẩn ngay trong lúc chờ tìm kiếm.
- Danh sách cũ chỉ tải 200 dòng và không có phân trang. Danh sách mới phân trang phía server, 25 dòng/trang, có tổng kết quả và tự điều chỉnh trang khi xóa dòng cuối.
- Lỗi tải dữ liệu từng trông giống danh sách trống. Nay có thông báo lỗi riêng, nút thử lại và trạng thái tải ở mỗi lần truy vấn.
- Hộp xác nhận đóng trước khi thao tác hoàn thành và có thể gửi lặp. Nay khóa thao tác trong lúc chờ, giữ hộp thoại mở và giữ đúng loại, ID, phiên bản của dòng được chọn.
- Giao diện mobile bị tràn ngang, nút nhỏ. Bảng chuyển thành thẻ ở màn hình hẹp, nút thao tác 44px, có nhãn truy cập và viền focus bàn phím.
- Sửa số cột của trạng thái trống, ngày hiển thị, liên hệ/điện thoại, tên người lập và đơn vị tiền. Báo giá đã hủy không còn nút hủy lặp lại.

## Chức năng

- Hai loại Minh Triết / KNM; danh sách đang dùng / thùng rác.
- Tìm kiếm, khoảng ngày, trạng thái Minh Triết, người lập; sắp xếp số, ngày, khách hàng, tổng tiền.
- Thống kê theo toàn bộ kết quả lọc. Giá trị không cộng báo giá đã hủy. Tháng tính theo `Asia/Ho_Chi_Minh`, có cả giới hạn đầu và cuối tháng.
- Xem nhanh thông tin, sản phẩm và 50 thay đổi gần nhất; mở trình soạn thảo đầy đủ.
- Sao chép vào trình soạn thảo dưới dạng chưa lưu; chỉ cấp số mới khi lưu.
- Xuất CSV theo bộ lọc, tối đa 5.000 dòng. Nếu vượt giới hạn sẽ thông báo số dòng đã xuất và yêu cầu thu hẹp bộ lọc. Trường văn bản được chống công thức bảng tính.
- URL giữ loại, tìm kiếm, khoảng ngày, trạng thái, người lập, thứ tự và trang. Trình soạn thảo giữ đường quay lại đúng danh sách qua cả lần lưu đầu tiên và sao chép tiếp.
- Xóa mềm bản nháp Minh Triết hoặc báo giá KNM; Minh Triết ở trạng thái khác dùng hủy. Khôi phục giữ nguyên số, nội dung và người lập; thêm lịch sử `restore`.

## Áp dụng Supabase

Chạy toàn bộ [`20261015044005_admin_quotations_management.sql`](../supabase/migrations/20261015044005_admin_quotations_management.sql) trong SQL Editor của đúng dự án. Migration có transaction và chạy lại được; không xóa hoặc sửa nội dung báo giá khi áp dụng.

Cần có schema từ `supabase_quotation_management.sql`, `supabase_quotation_v2.sql`, `supabase_knm_quotations.sql`, `supabase_knm_quotations_v2.sql`, cùng `is_admin()` / `is_active_user()` từ chính sách hồ sơ quản trị.

Sau khi chạy SQL, bấm **Làm mới** trên trang. Bộ lọc người lập phải bật và thống kê đổi từ “Giá trị trang này” thành “Giá trị báo giá”. Kiểm tra thùng rác bằng dữ liệu thử do bạn tạo nếu muốn kiểm tra thao tác ghi.

Migration chưa được áp dụng lên dự án thật trong lượt triển khai này: CLI chưa có phiên quản trị. SQL đã được chạy với schema/RPC gốc trong Postgres nhúng PGlite, bao gồm chạy lại migration để kiểm tra tính lặp lại.

### Trước khi áp dụng SQL

Trang tự dùng RPC cũ nếu RPC mới chưa tồn tại. Tra cứu, phân trang, xem nhanh, sao chép, CSV và thao tác quản lý cũ vẫn hoạt động. Thống kê giá trị/trạng thái chỉ tính trang hiện tại, có nhãn rõ ràng. Bộ lọc người lập và thùng rác cần migration; không lọc giả trên một trang dữ liệu.

Kiểm tra phiên bản khi xóa/đổi trạng thái chỉ được bảo đảm sau khi có RPC mới. API cũ giữ hành vi đồng thời vốn có; vì vậy cần áp dụng SQL để hoàn tất nâng cấp.

## Quyền truy cập và RPC

Ba RPC public là `security invoker`, chuyển tiếp tới hàm `security definer` trong schema `quotation_admin_private`, với `search_path` rỗng và tên đối tượng đầy đủ:

| RPC | Nội dung |
| --- | --- |
| `admin_list_quotations` | Danh sách, tổng kết quả, thống kê và người lập; lọc/sắp xếp/phân trang trên server |
| `admin_get_quotation` | Chi tiết và lịch sử, kể cả dòng đã xóa |
| `admin_change_quotation` | Xóa, đổi trạng thái, khôi phục; khóa dòng và bắt buộc `p_expected_updated_at` |

Không thêm `quotation_admin_private` vào exposed schemas của Data API. Cả wrapper và hàm thực thi chỉ cho tài khoản xác thực, đồng thời kiểm tra lại tài khoản đang hoạt động và vai trò admin ở mỗi lần gọi. Nhân viên không đọc được báo giá đã xóa, sản phẩm hoặc lịch sử tương ứng qua truy vấn bảng. Không cấp quyền ghi bảng trực tiếp cho frontend.

Thay đổi báo giá ở phiên khác trả `40001`: giao diện đóng xác nhận và tải lại để người dùng kiểm tra. Quyền không hợp lệ / dòng không tồn tại cũng tải lại. Lỗi khác giữ hộp xác nhận để thử lại.

## Kiểm chứng

```powershell
npm run test:admin-quotations
npm run build
```

Kiểm thử gồm tiện ích URL/CSV, component thật với API giả và SQL chạy cùng bốn file schema/RPC gốc. Bao phủ phản hồi đảo thứ tự, debounce, phân trang, điều hướng, lỗi API mới/cũ, xác nhận gửi một lần, khôi phục, kiểm tra phiên bản, quyền admin/nhân viên/ẩn danh/tài khoản khóa và RLS dữ liệu trong thùng rác.

Kiểm tra trực tiếp trên Chrome với dữ liệu thật chỉ thực hiện thao tác đọc; xác nhận trang không tràn ngang ở 320px và 390px. Các thao tác ghi được kiểm tra trên cơ sở dữ liệu thử, không xóa hay đổi trạng thái báo giá thật.
