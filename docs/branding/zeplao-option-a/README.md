# ZepLao — Option A / Minimal Flow

Bộ nhận diện 1.0 · ngày 16/11/2026.

Đây là bộ asset triển khai được chuẩn hóa bằng vector từ Option A đã chọn: chữ Z dạng dải gấp, tím indigo, wordmark **ZepLao**, phụ đề **TOOLS SUITE**. Các đường cong, khoảng cách và wordmark được dựng lại để nhất quán ở nhiều kích thước; không phải bản cắt pixel từ ảnh concept. Ảnh concept gốc nằm trong `reference/` để đối chiếu.

## Mở nhanh

1. Mở `preview/index.html` để xem bộ asset trực tiếp, không cần cài đặt.
2. Xem `preview/brand-overview.png` để duyệt nhanh.
3. Gửi toàn bộ ZIP cùng `00_HUONG_DAN_AI_AP_DUNG.md` cho AI đang làm trên repository thực tế.
4. Thư mục `public/brand/zeplao/` là asset triển khai, không cần đưa ảnh concept lên website.

## Có trong gói

- Logo ngang đầy đủ / gọn, logo xếp dọc; nền sáng / tối; bản đơn sắc.
- Biểu tượng Z SVG và PNG 64–1024 px; SVG logo dùng đường nét (outline), không cần tải font.
- App icon gradient / sáng / tối / maskable, 192 / 512 / 1024 px.
- Favicon SVG, PNG 16 / 32 / 48 / 64 px, ICO đa kích thước; Apple Touch 180 px.
- 9 icon công cụ × 2 chủ đề, SVG và PNG 96 / 192 / 512 px.
- 21 icon UI SVG 24 × 24 và SVG sprite.
- Ảnh chia sẻ 1200 × 630 px cho nền sáng / tối, kèm bản SVG chỉnh sửa.
- CSS tokens, webmanifest mẫu, React/TSX adapter tùy chọn, bảng ánh xạ route và hướng dẫn áp dụng.
- Danh mục asset, kích thước, checksum và mã nguồn dựng lại.

## Chọn đúng file

| Vị trí | File ưu tiên |
| --- | --- |
| Header nền sáng | `public/brand/zeplao/logos/zeplao-horizontal-light.svg` |
| Header nền tối | `public/brand/zeplao/logos/zeplao-horizontal-dark.svg` |
| Header rất hẹp | Bản `-compact.svg`, hoặc `marks/zeplao-mark-primary.svg` |
| Màn hình đăng nhập | `logos/zeplao-stacked-light.svg` hoặc bản dark |
| Tab trình duyệt | `favicons/favicon.svg` + fallback ICO |
| PWA | `app/zeplao-app-gradient-192.png`, `-512.png` + `zeplao-app-maskable-512.png` |
| Thẻ công cụ | `icons/tools/{tên}-{light hoặc dark}.svg` |
| Nút / menu nhỏ | `icons/ui/{tên}.svg` qua CSS mask hoặc inline SVG |
| Chia sẻ mạng xã hội | `social/zeplao-og-light.png` |

Tên thương hiệu luôn viết **ZepLao**. Logo `light` nghĩa là dùng trên nền sáng; logo `dark` là chữ trắng dùng trên nền tối. Các logo và mark PNG có nền trong suốt. Icon công cụ có nền tile; icon maskable có nền kín toàn khung.

## Quy tắc ngắn

- Màu chính `#6558F5`, hover `#5140D8`, nền nhạt `#F0EDFF`, chữ `#111118`, nền tối `#0D0B2E`.
- Logo đủ phụ đề nên rộng từ 180 px; bản gọn từ 120 px; biểu tượng riêng từ 24 px. Favicon 16 px dùng bản chuyên dụng.
- Khoảng trống quanh logo ít nhất bằng 1/4 chiều cao biểu tượng Z.
- Không kéo méo, đổi tỷ lệ, xoay, thêm viền, bóng, đổi chữ hoặc trộn Option B/C.
- Không dùng ảnh brand sheet như logo. Không đặt logo dark trên nền trắng.
- Chữ trong logo đã outline từ Open Sans; ứng dụng có thể giữ font UI hiện tại. Thông tin bản quyền font nguồn nằm trong `docs/FONT_NOTICE.txt`.
- Gói này không bao gồm source dự án website và chưa thay đổi website đang chạy.
