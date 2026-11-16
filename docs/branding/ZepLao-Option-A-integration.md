# Tích hợp ZepLao Option A

Trạng thái: **local trong repository**, chưa deploy. Nguồn asset: `ZepLao-Option-A-Brand-Kit-v1.0.zip`, bản 1.0.0. Không dựng lại logo và không dùng ảnh concept làm asset giao diện.

## Kiểm tra dự án

- Đã đọc `00_HUONG_DAN_AI_AP_DUNG.md`, README của ZIP và README của repository. Không tìm thấy `AGENTS.md` trong ZIP, repository hoặc các thư mục cha áp dụng.
- React 19.2, Vite 8, React Router 7 với `BrowserRouter`; phục vụ ở root và dùng `public/` cho static asset.
- Theme qua `ThemeContext`, `data-theme` và khóa `app-theme`; giữ nguyên cách lưu lựa chọn.
- Metadata dùng `react-helmet-async` 3 và cơ chế hoist của React 19. Giữ title/description/robots riêng từng trang; không có canonical sẵn để thay đổi.
- Trước tích hợp chưa có manifest/service worker. Thêm một manifest với icon chính và maskable, chưa thêm offline/service worker.
- Các thay đổi Tools và liên kết hiện có trước tác vụ được giữ lại. Không đổi package name, API, database, dữ liệu báo giá, quyền truy cập hoặc khóa lưu trữ.

## Nhận diện và mapping

- Header/footer: logo ngang sáng/tối; màn hình hẹp dùng bản compact. Link logo có tên truy cập `ZepLao — Trang chủ`.
- Đăng nhập: logo stacked sáng/tối, tên hiển thị **ZepLao**.
- Icon menu dùng SVG mask với `currentColor`. Icon công cụ dùng SVG theo theme, không đổi hình SVG gốc.
- Accent `#6558F5`, hover `#5140D8`; chữ liên kết tối dùng tint `#B0A7FF` để đủ tương phản. Giữ font và bố cục Genesis.
- Favicon SVG/ICO/PNG, Apple Touch 180 px, app icon 192/512 px và maskable 512 px đều từ ZIP.
- Manifest dùng đường dẫn tương đối; `id`, `start_url`, `scope` trỏ về root ứng dụng. OG/Twitter image lấy origin đang chạy, không cố định domain Netlify.
- Metadata mặc định có cơ chế nhường cho thẻ riêng từng trang, tránh title/description trùng do React 19 hoist.

| Chức năng / URL hiện tại | Icon |
| --- | --- |
| Báo giá Minh Triết và trang con | `quote-minh-triet` |
| Báo giá KNM và trang con | `quote-knm` |
| Link ảnh sản phẩm | `image-links` |
| `/tools/watermark` và tự động | `watermark` |
| `/tools/chuyen-doi-file` | `convert` |
| Dashboard tổng quan | `dashboard` |
| Hồ sơ/ảnh đại diện cá nhân | `profile` |
| Memory Game | `memory` |
| Quản trị | `admin` |

Tools dùng app icon ZepLao cho bộ tiện ích chung. Clear Video giữ icon video hiện có vì ZIP không có icon chuyên biệt cho công cụ này. Logo/ảnh của công ty trên báo giá và avatar cá nhân được giữ nguyên.

## File tích hợp

Các file mới:

- `public/brand/zeplao/`: 177 asset, gồm `site.webmanifest` đã chỉnh cho ứng dụng.
- `src/utils/brandAssets.js`: đường dẫn asset theo base URL và mapping route/icon.
- `src/components/brand/ZepLaoBrand.jsx`: logo, icon công cụ và icon UI.
- `src/components/brand/BrandMetadata.jsx`: metadata và fallback tương thích React 19.
- `src/styles/Brand.css`: kích thước logo/icon và điều chỉnh màn hình hẹp.
- `docs/branding/zeplao-option-a/`: hướng dẫn, inventory, checksum, bản quyền và mapping gốc.

Các file cập nhật cho nhận diện:

- `index.html`, `src/main.jsx`, `src/App.jsx`.
- `src/components/Header.jsx`, `src/components/Footer.jsx`, `src/components/auth/AuthCard.jsx`, `src/components/notifications/NotificationBell.jsx`.
- `src/pages/AuthPage.jsx`, `src/pages/AuthCallbackPage.jsx`, `src/pages/NotificationsPage.jsx`.
- `src/pages/Tools/ToolsPage.jsx`, `src/pages/Tools/ClearVideoPage.jsx`, `src/pages/Tools/toolCatalog.js`, `src/pages/Tools/Tools.module.css`.
- `src/pages/FileConvert/FileConvertPage.jsx`, `src/pages/Watermark.jsx`, `src/pages/WatermarkAuto.jsx`.
- `src/pages/Dashboard/DashboardPage.jsx`, `src/pages/Dashboard/OverviewSection.jsx`.
- `src/pages/Admin/AdminLayout.jsx`, `src/pages/Admin/AdminNotificationsPage.jsx`.
- `src/styles/App.css`, `src/styles/Header.css`, `src/styles/Home.css`, `src/styles/Footer.css`, `src/styles/auth-page.css`.

## Kiểm tra

- `npm run build`: đạt.
- `npm run lint`: đạt. Dự án không có script typecheck riêng.
- `npm run test:tools`: 23 kiểm thử đạt.
- `npm run test:file-convert`: 12 kiểm thử đạt.
- `node --test src/utils/authRedirect.test.js src/utils/authValidation.test.js`: 7 kiểm thử đạt.
- `npm run test:notifications`: 21 kiểm thử đạt.
- `node --import ./tests/aiRenameLoader.mjs --test tests/adminUsageUI.test.mjs`: 10 kiểm thử đạt.
- `node --import ./tests/avatarFramesLoader.mjs --test tests/avatarFramesUI.test.mjs`: 10 kiểm thử đạt.
- Tổng: **83 kiểm thử đạt**.
- Đối chiếu SHA-256: 176 asset giữ nguyên; chỉ manifest được chủ động chỉnh. Đối chiếu kích thước 115 PNG. Maskable có alpha 255 trên toàn khung.
- Kiểm tra trình duyệt local với Playwright: trang chủ, Tools, đăng nhập, chuyển đổi file, Clear Video và màn hình chặn truy cập dashboard/admin. Các chiều rộng 1440/768/390/320 px, sáng/tối; 40 ảnh trong ma trận kiểm tra.
- Kiểm tra theme sau reload, Escape đóng menu, Ctrl+K tìm công cụ, lọc PDF, chọn tab PDF và các chuyển hướng URL cũ.
- Các asset tích hợp trả HTTP 200 với MIME phù hợp; kiểm tra title/description/manifest không trùng, OG image tuyệt đối, logo theo theme và không tràn ngang.

## Ảnh và giới hạn

Ảnh thực tế, script và báo cáo JSON nằm tại `output/playwright/zeplao-brand/` (thư mục artifact local được gitignore).

- `before-home-desktop-light.png`: trang chủ trước tích hợp.
- `after-home-1440-light.png`, `after-home-1440-dark.png`: desktop sáng/tối.
- `after-tools-390-light.png`, `after-tools-390-dark.png`: Tools mobile sáng/tối.
- `after-auth-320-light.png`, `after-auth-320-dark.png`: đăng nhập ở 320 px.
- `after-mobile-menu-light.png`, `after-mobile-menu-dark.png`: menu mobile.
- `browser-qa.json`, `interactions-qa.json`, `final-browser-check.json`: kết quả tự động và metadata thực tế.

Không đăng nhập tài khoản thật, gửi biểu mẫu, gọi AI có tính phí hoặc sửa dữ liệu production. Dashboard/admin được kiểm tra ở trạng thái chặn truy cập và qua kiểm thử component với dữ liệu giả lập; chưa chụp màn hình nội dung bên trong của tài khoản thật. Chưa kiểm thử cài app trên iOS/Android; manifest/icon được kiểm tra bằng trình duyệt desktop.

Iframe Cloudflare Turnstile trên trang đăng nhập có ghi lỗi CSP nội bộ khi chạy ở localhost. Lỗi đến từ iframe bên thứ ba, không phải asset ZepLao; giữ nguyên cấu hình CAPTCHA/CSP, không vượt xác minh và chưa kiểm thử đăng nhập thật.

Không triển khai lên Netlify hay dịch vụ hosting nào trong tác vụ này.
