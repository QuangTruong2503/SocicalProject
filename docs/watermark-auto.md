# Watermark tự động (`/watermark/auto`)

Đóng logo, đặt tên ảnh bằng AI và lưu thẳng vào `<thư mục sản phẩm>/Named`, theo từng thư mục sản phẩm. Đặc tả gốc: [agent-watermark-auto.md](agent-watermark-auto.md).

## Cách dùng

1. Mở từ `/watermark` (liên kết “Watermark tự động theo thư mục sản phẩm”) hoặc vào thẳng `/watermark/auto`. Cần đăng nhập và có quyền Đặt tên AI.
2. **Thêm thư mục sản phẩm** (mỗi lần một thư mục) hoặc **Chọn thư mục cha** (mỗi thư mục con trực tiếp là một sản phẩm). Tên thư mục là tên sản phẩm gửi cho AI.
3. Chọn logo (bắt buộc), chỉnh logo như trang Watermark, chọn **Kích thước ảnh xuất** (800 × 600 px hoặc Kích thước gốc) và model. Prompt nằm trong **Nâng cao**, dùng chung với trang Watermark.
4. **Bắt đầu xử lý**. Có **Dừng**, **Tiếp tục phần còn lại**, **Thử lại ảnh lỗi**; kết thúc có báo cáo sao chép / CSV / JSON (chỉ tạo trên máy).

Ví dụ: `SanPham/Máy khoan Bosch GSB 13 RE/IMG_001.jpg` → `SanPham/Máy khoan Bosch GSB 13 RE/Named/may-khoan-bosch-gsb-13-re-goc-nhin-mat-truoc.jpg`.

## Quy tắc

- Chỉ đọc ảnh JPG/PNG/WebP nằm trực tiếp trong thư mục sản phẩm; kiểm tra chữ ký file khi quét và giải mã khi xử lý. Thư mục con, ảnh ở gốc thư mục cha và mọi thư mục `Named` (không phân biệt hoa/thường) bị bỏ qua và được báo số lượng.
- Ảnh nguồn không bị đổi tên, di chuyển, ghi đè hay xóa. `Named` chỉ được tạo khi lưu ảnh đầu tiên; nếu đã có `named`/`NAMED` thì dùng lại. Một file tên `Named` chặn sản phẩm đó với thông báo rõ.
- Tên file: `slug-ten-san-pham-mo-ta.jpg`. Trùng (kể cả với file đã có, khác hoa/thường) → `-2`, `-3`… theo thứ tự ảnh nguồn; kiểm tra lại ngay trước khi tạo file, không bao giờ ghi lên file có sẵn. Ảnh AI không nhận diện rõ → `slug-ten-san-pham-001.jpg`, gắn **Cần kiểm tra**, vẫn lưu.
- 800 × 600: chèn logo trên ảnh gốc rồi letterbox nền trắng (logo không nằm trên lề trắng). Kích thước gốc: không thu nhỏ (bỏ giới hạn 4096 px chỉ cho chế độ này, cả worker lẫn fallback), đúng hướng EXIF; ảnh vượt khả năng canvas của máy báo lỗi và gợi ý dùng 800 × 600. Ảnh xuất luôn là JPEG, nền trắng cho ảnh trong suốt.
- Hàng đợi: từng sản phẩm một, mỗi request ≤ giới hạn endpoint (6 ảnh) và chỉ một sản phẩm, một request AI tại một thời điểm. Không có giới hạn 60 ảnh/lượt như hộp thoại thủ công; quota/rate limit vẫn do server quyết định.
- AI nhận bản thu nhỏ ≤ 512 px **của ảnh gốc chưa có logo**. Kết quả ghép theo ID, không theo thứ tự.

## Lỗi, dừng, thử lại

| Tình huống | Hành vi |
| --- | --- |
| Ảnh hỏng / không giải mã được | Lỗi riêng ảnh đó, không gửi AI |
| AI thiếu/trùng/lạ ID | Chỉ ảnh không có tên hợp lệ bị lỗi |
| Hết phiên, mất quyền model, quota, AI tạm dừng, mạng/timeout (sau lần gửi lại có sẵn của service), rate limit | Tạm dừng hàng đợi, ảnh chưa xử lý ở trạng thái chờ (không tính lỗi). Rate limit có `retryAfterSeconds` → nút Tiếp tục khóa tới khi hết thời gian chờ |
| Lỗi AI khác | Lỗi các ảnh của lô; 3 lô lỗi liên tiếp → tạm dừng |
| Mất quyền ghi / thư mục bị xóa, ổ đĩa ngắt | Chặn riêng sản phẩm đó (nút **Cấp quyền** / **Quét lại**), sản phẩm khác tiếp tục |
| Ổ đĩa đầy | Tạm dừng cả lượt |
| Ảnh nguồn đổi sau khi quét | Lỗi “nguồn đã thay đổi”, bỏ tên AI cũ, cần **Quét lại** |
| Dừng | Không xếp ảnh mới, hủy request; file đang ghi hoàn tất trước; phản hồi đến muộn bị bỏ |
| Thử lại lỗi ghi | Dùng lại tên AI và tên file đã giữ chỗ, render lại từ ảnh gốc (không đóng logo hai lần), không gọi AI lại |

Tiếp tục/thử lại dùng cấu hình chụp lúc bấm Bắt đầu. **Bắt đầu lượt mới** xử lý lại mọi ảnh đã chọn với cấu hình hiện tại; bản mới có hậu tố. Tiếp tục chỉ trong phiên đang mở: tải lại trang phải chọn lại thư mục.

## Giới hạn nền tảng

- Cần Chrome/Edge desktop có File System Access API, chạy qua HTTPS hoặc localhost. Trình duyệt khác thấy thông báo và không chạy được; **không có** phương án ZIP thay thế ở bản này.
- File System Access không khóa thư mục với ứng dụng khác: không chỉnh `Named` bằng ứng dụng khác khi đang chạy.
- Hủy request trên trình duyệt không bảo đảm hủy chi phí của request đã tới server.

## Thống kê

`sourcePage: 'watermark/auto'` cho mọi sự kiện (xem [usage-logging.md](usage-logging.md)). Mỗi lần Bắt đầu / Tiếp tục / Thử lại: `image.create` (ảnh render lần đầu; ghi lại file không tính lại), `image.download` với `downloadMethod: 'direct'`, `imageSize`, `delivery: 'file_written'` (chỉ sau `close()` thành công), và `ai.naming.apply` cho ảnh đã lưu bằng tên AI. Bộ đếm `watermark_image_counts` cũng dùng `source_page = 'watermark/auto'`. Không gửi tên file, tên sản phẩm, đường dẫn hay prompt.

## Mã nguồn và kiểm thử

- Trang `src/pages/WatermarkAuto.jsx`; giao diện `src/components/watermark/auto/`; hàng đợi `src/hooks/useWatermarkAutoProcessor.js` (`createAutoRunner`, không phụ thuộc React); thư mục `src/utils/productFolderAccess.js`; đặt tên/báo cáo `src/utils/watermarkAutoNaming.js`; CSS `src/styles/WatermarkAuto.css`.
- `npm run test:watermark-auto`: quét/ghi thư mục trên handle giả lập, hàng đợi với AI giả lập (đảo thứ tự, thiếu ID, dừng, rate limit, mất quyền, đầy đĩa…), renderer kích thước gốc/letterbox ở worker và fallback, UI trang thật trong jsdom.
- Đã kiểm tra trên Chrome headless thật: ghi file thật qua handle OPFS (thay hộp thoại chọn thư mục), worker và fallback, EXIF, 6000 × 4000, ảnh trong suốt, 390 px sáng/tối. Endpoint AI được giả lập; **chưa** thử với hộp thoại chọn thư mục trên ổ đĩa thật và chưa gọi AI thật.
