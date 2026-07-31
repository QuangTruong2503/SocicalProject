# Quản lý báo giá Minh Triết

## Cài đặt

1. Sao lưu cơ sở dữ liệu Supabase và mã nguồn.
2. Chạy toàn bộ `supabase_quotation_management.sql` trong Supabase SQL Editor. Script có thể chạy lại trên bản cài đặt cũ; đơn giá sản phẩm được hiểu là đã bao gồm VAT.
3. Mọi tài khoản đã đăng nhập đều được truy cập module; không cần gán vai trò riêng.
4. Kiểm tra `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` trong biến môi trường. Không đưa service-role key vào frontend.

## Xuất PDF

- PDF được tạo hoàn toàn tại trình duyệt từ bản xem trước báo giá và tự động tải xuống.
- Không cần cài Excel hoặc LibreOffice trên máy chủ và không tải dữ liệu báo giá lên API chuyển đổi.
- Chức năng sử dụng `html2canvas` để kết xuất nội dung và `jsPDF` để tạo file PDF A4.
5. Chạy `npm install`, `npm run lint`, `npm run build`.
6. Triển khai thư mục build theo quy trình hiện tại. Đảm bảo hai tài nguyên sau được phục vụ công khai:
   `public/templates/bao-gia-minh-triet.xlsx` và `public/templates/minh-triet-logo.png`.

## Sử dụng

- Danh sách: `/admin/bao-gia`
- Tạo mới: `/admin/bao-gia/tao-moi`
- Chọn khách hàng đã lưu để tự điền thông tin, hoặc nhập thông tin rồi nhấn **Tạo khách hàng mới**.
- **Lưu nháp** cho phép lưu dữ liệu đang hoàn thiện. **Lưu báo giá** kiểm tra các trường bắt buộc.
- Biểu mẫu tự lưu cục bộ theo tài khoản và báo giá, nên chuyển tab hoặc rời trang rồi quay lại không mất dữ liệu đang nhập.
- VAT được chọn riêng cho từng sản phẩm: 5%, 8% hoặc 10%.
- Mỗi dòng có ô **Tên sản phẩm** và **Mô tả** riêng. Khi xuất Excel/PDF, tên được in đậm; mô tả nằm ở dòng dưới và giữ nguyên các lần xuống dòng.
- **Xuất Excel** sao chép chính workbook mẫu, chèn số dòng sản phẩm cần thiết và đẩy tổng cộng, điều khoản, chữ ký xuống dưới.
- **Xuất PDF** và **In** mở hộp thoại in chuẩn A4 của trình duyệt; chọn máy in “Save as PDF” để lưu PDF.
- Khi sửa giá trong báo giá, dữ liệu giá của danh mục sản phẩm không bị thay đổi.

## Sao lưu và khôi phục

- Bản sao các file trước khi chỉnh sửa nằm ở `.codex-backups/quotation-before-20260731/`.
- Sao lưu database bằng chức năng Database Backups của Supabase hoặc `pg_dump`.
- Khôi phục mã nguồn: chép file tương ứng từ thư mục backup về vị trí cũ.
- Hoàn tác migration (sau khi đã sao lưu dữ liệu):

  ```sql
  drop function if exists public.save_quotation(jsonb);
  drop function if exists public.next_quotation_number(date);
  drop table if exists public.quotation_items;
  drop table if exists public.quotations;
  drop table if exists public.quotation_counters;
  drop table if exists public.quotation_customers;
  drop type if exists public.quotation_status;
  ```

## Cấu hình

- Thông tin công ty cho bản xem trước/in: `src/data/quotationCompany.js`.
- Thông tin người lập được điền ban đầu từ `profiles` nhưng có thể sửa riêng cho từng báo giá.
- Nội dung điều khoản mặc định: `DEFAULT_TERMS` trong `src/utils/quotation.js`.
- File Excel nguồn: `public/templates/bao-gia-minh-triet.xlsx`.

## Thư viện

Không cài thêm package. Module dùng các thư viện đã có: React, React Router, Supabase JS, JSZip, Day.js, React Toastify, React to Print và React Icons.

## Kiểm thử

Chạy:

```powershell
node scripts/test-quotation.mjs
npm run lint
npm run build
```

Script kiểm tra tính tiền, dữ liệu bắt buộc, số lượng 0, giá âm, dấu tiếng Việt, tên sản phẩm dài và xuất workbook với 1/20 sản phẩm. File QA được ghi vào `output/quotation-tests/`.

Các kiểm thử cần thực hiện sau khi kết nối dự án Supabase thật:

- Hai phiên người dùng cùng gọi `next_quotation_number` và xác nhận hai số khác nhau.
- RLS phải từ chối người chưa đăng nhập và cho phép người đã đăng nhập.
- Lưu nháp, sửa, sao chép, hủy và xóa mềm trên dữ liệu thật.
- Kiểm tra quyền tải từng báo giá theo chính sách tổ chức nếu sau này tách dữ liệu theo chi nhánh.
