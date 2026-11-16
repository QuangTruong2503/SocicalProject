# HƯỚNG DẪN CHO AI — ÁP DỤNG ZEPLAO OPTION A

## Mục tiêu và phạm vi

Áp dụng bộ nhận diện **ZepLao Tools Suite / Option A — Minimal Flow** vào dự án website hiện có. Tên hiển thị chính xác là **ZepLao** (Z và L viết hoa). Thay tên AISEO trong giao diện thương hiệu, logo, favicon, icon công cụ và metadata phù hợp. Dùng asset có sẵn trong gói, không sinh lại bằng AI và không lấy ảnh concept làm logo.

Website tham chiếu lúc khảo sát: `https://zeplao.netlify.app/`. Chưa có repository trong gói này. Các route phía dưới là những route quan sát trên trang chủ ngày 16/11/2026; AI phải xác nhận cấu trúc và trạng thái thực tế trước khi sửa. Không giả định framework, theme selector hoặc tên component.

## 1. Đọc dự án trước khi sửa

1. Đọc AGENTS.md và tài liệu của repository; kiểm tra git status, giữ nguyên thay đổi của người dùng.
2. Xác định framework, static/public directory, base URL, router, entry HTML, hệ thống theme, cách quản lý metadata, service worker và PWA manifest hiện tại.
3. Tìm bằng `rg` các chuỗi `AISEO`, `AISEO Tools Suite`, `zeplao.png`, favicon, logo, manifest và icon trong header/nav/mobile menu/dashboard/tool cards. Dùng kết quả thực tế để sửa có chọn lọc.
4. Liệt kê các vị trí sẽ sửa. Không đổi tên package, API, biến môi trường, khóa dữ liệu, database, localStorage, route hay file cấu hình chỉ vì chứa tên cũ. Tên kỹ thuật có thể là hợp đồng đang được sử dụng.

## 2. Chép asset và giữ cấu trúc

- Chép nội dung `public/brand/zeplao/` vào thư mục static/public tương ứng của dự án để URL cuối là `/brand/zeplao/...` khi app phục vụ ở root.
- Với app có base path, dùng helper URL/base asset của framework; cập nhật cả manifest src và đường dẫn CSS mask. Không hard-code root path khi deployment không ở root.
- Chỉ chép asset cần dùng nếu dự án yêu cầu bundle nhỏ. Giữ ít nhất logo sáng/tối, favicon, app icons được tham chiếu và icon đúng chức năng.
- SVG là file chính. PNG dùng khi nền tảng không hỗ trợ SVG. Không nhúng toàn bộ PNG độ phân giải cao vào JS.
- Đối chiếu `docs/ASSET_INVENTORY.json`. Không đổi tên asset nếu không cập nhật mọi tham chiếu.

## 3. Logo và tên thương hiệu

| Vị trí | Asset / hành vi |
| --- | --- |
| Header desktop nền sáng | `logos/zeplao-horizontal-light.svg` |
| Header desktop nền tối | `logos/zeplao-horizontal-dark.svg` |
| Header mobile / chỗ hẹp | Bản `-compact.svg` hoặc Z mark riêng, giữ accessible name |
| Trang đăng nhập / welcome | `logos/zeplao-stacked-light.svg` hoặc dark |
| Avatar mặc định của app | `app/zeplao-app-gradient.svg` khi phù hợp; giữ avatar người dùng |

- Logo có hai dòng chữ đầy đủ rồi: nếu thay cả lockup, bỏ wordmark AISEO cạnh logo cũ để không lặp tên. Nếu cần giữ chữ HTML sẵn có, chỉ dùng `marks/zeplao-mark-gradient.svg`, đổi tên HTML thành ZepLao và giữ phụ đề TOOLS SUITE.
- Logo link về trang chủ, có accessible name `ZepLao — Trang chủ`. Nếu link đã có aria-label đầy đủ thì ảnh logo `alt=""`; nếu chưa có thì dùng `alt="ZepLao Tools Suite"`.
- Dùng kích thước intrinsic từ SVG viewBox và chiều cao hiển thị 40–48 px ở desktop, 32–40 px ở mobile. `object-fit: contain`; không cắt bằng overflow/crop.
- Logo dark là asset chữ trắng, không phải nền trắng. Chọn theo màu nền thực tế của header, không chỉ theo OS theme.
- Tên trang chủ có thể là `Trang chủ — ZepLao Tools Suite`. Các trang khác giữ tiêu đề chức năng và thay hậu tố thương hiệu. Cập nhật title động trong router/SEO component, không chỉ index.html.

## 4. Thay icon đúng chức năng

| Khu vực / route tham chiếu | Icon công cụ |
| --- | --- |
| `/bao-gia-minh-triet` và trang tạo mới | `quote-minh-triet` |
| `/bao-gia-knm` | `quote-knm` |
| `/link-anh-san-pham` | `image-links` |
| `/watermark` | `watermark` |
| `/chuyen-doi-file` | `convert` |
| `/dashboard/overview` | `dashboard` |
| `/memory-game` | `memory` |
| Hồ sơ cá nhân | `profile` — xác nhận vị trí vì dashboard và hồ sơ có thể dùng chung route |
| `/admin` | `admin` |

- Thẻ công cụ: `icons/tools/{name}-light.svg` trên nền sáng, `-dark.svg` trên nền tối, hiển thị khoảng 48–64 px.
- Menu/nav/nút nhỏ: dùng bộ `icons/ui/`, cỡ 20–24 px; dùng `quote` chung cho menu Báo Giá và giữ nhãn chữ cụ thể.
- Thanh điều hướng: `home`, `watermark`, `quote`, `dashboard`, `admin`. Nút tiện ích: `notification`, `theme`, `menu`, `close`, `arrow-right`, `chevron-down`, `upload`, `download`, `search`, `copy`, `check`, `settings`.
- Bỏ emoji làm icon trong các mục vừa thay để tránh xuất hiện hai icon. Giữ nhãn tiếng Việt và trạng thái active/focus/disabled.
- Icon trang trí cạnh chữ: `alt=""` hoặc `aria-hidden="true"`. Nút chỉ có icon phải có accessible name như `aria-label="Mở menu"` hoặc `aria-label="Thông báo"`.
- SVG ngoài qua `<img>` KHÔNG kế thừa `currentColor` từ CSS bên ngoài. Dùng CSS mask trong `brand-tokens.css`, inline SVG, hoặc SVG sprite nếu dự án hỗ trợ. Không cố đổi stroke bằng CSS trên thẻ img.

## 5. Màu sắc và theme

Import `brand-tokens.css` vào entry/style layer phù hợp. Ánh xạ biến vào theme/token system đang có thay vì ghi đè toàn cục tùy tiện. Chỉ thay accent/brand cần thiết; không tái thiết kế toàn bộ UI. Giữ font nội dung đang dùng, dữ liệu, khoảng cách và chức năng hiện tại. Kiểm tra độ tương phản cho cả light và dark. Không dùng tím nhạt để viết chữ nhỏ trên nền trắng.

## 6. Favicon, PWA và metadata

1. Dùng `integration/head-snippet.html` làm mẫu và gộp vào cơ chế head của framework. Xóa/thay các favicon cũ đang cạnh tranh; tránh hai manifest.
2. Favicon chính: `favicons/favicon.svg`; fallback `favicons/favicon.ico`; PNG 32 px. Apple Touch: `favicons/apple-touch-icon.png` 180 px.
3. Nếu đã có PWA manifest, chỉ cập nhật name, short_name, icons, màu sắc phù hợp. Giữ id, start_url, scope, shortcuts, share_target, protocol_handlers và cấu hình offline hiện có. Nếu chưa có, có thể dùng `site.webmanifest` mẫu sau khi đặt start_url/scope phù hợp.
4. Icon maskable dùng đúng `app/zeplao-app-maskable-512.png`; không lấy app icon có góc trong suốt để khai báo purpose maskable.
5. `og:site_name = ZepLao Tools Suite`; `og:image` và `twitter:image` dùng URL tuyệt đối trên origin thật đến `social/zeplao-og-light.png` (1200 × 630). Giữ og:title/description/url, canonical và robots theo từng trang. Không hard-code domain Netlify vào môi trường khác.
6. Giữ metadata theme-color theo theme thực tế nếu ứng dụng đã hỗ trợ dynamic theme. Xử lý cache favicon/PWA bằng cơ chế version cache hiện tại; không xóa dữ liệu cá nhân hoặc lịch sử người dùng.

## 7. Tích hợp mẫu tùy framework

- React/TypeScript: xem `integration/ZepLaoBrand.tsx`; adapter là mã tùy chọn, phải chỉnh base path và nối với theme store sẵn có. Import CSS khi dùng ZepLaoUIIcon. Không cài thêm package chỉ để dùng asset này.
- HTML/Vue/Svelte/khác: dùng `<img>`/component hiện tại và cùng asset mapping; không đưa React vào dự án khác framework.
- SVG sprite có trong `icons/zeplao-sprite.svg` (id `zl-home`, `zl-quote`, ...); nếu CSP hoặc external-use không phù hợp, dùng mask/inline từ file nguồn.
- Chính sách CSP: chỉ dùng asset cùng origin; SVG không có script hay tài nguyên từ xa. Không nới lỏng CSP để sử dụng bộ ảnh.

## 8. Kiểm tra trước bàn giao

- Build/lint/typecheck đúng script thực tế; không tự giả định có npm run build. Kiểm tra console và network: không 404, không lỗi SVG/MIME/CSP.
- Kiểm tra header desktop 1440 px, tablet 768 px, mobile 390 px và 320 px, cả theme sáng/tối; không tràn, méo, mất phụ đề hay lặp tên.
- Kiểm tra trang chủ, nav desktop/mobile, tất cả tool cards, trang đăng nhập/dashboard/admin nếu có; route, quyền truy cập và hành vi vẫn đúng.
- Kiểm tra hover/active/focus-visible/disabled, bàn phím và accessible names cho nút chỉ có icon.
- Xác nhận title/description/canonical/OG và favicon thực tế sau reload; PWA icon và manifest src phải đúng base path, đúng kích thước và purpose.
- Kiểm tra bản PNG có alpha cho logo và full-bleed cho maskable. Không lấy screenshot làm asset.
- Tìm lại AISEO trong vùng UI; chỉ giữ chỗ cố ý thuộc dữ liệu/lịch sử/identifier kỹ thuật. Không search-replace toàn repository.
- Chụp ảnh trước/sau những vùng đã thay, báo danh sách file thay, kiểm tra đã chạy, những phần chưa kiểm tra hoặc bị chặn. Không tuyên bố đã triển khai nếu chỉ sửa local.

## 9. Phạm vi ngoài yêu cầu

Không đổi giá, nội dung báo giá, dữ liệu, tài khoản, API, quyền, route, thanh toán, lịch sử hay logic nghiệp vụ. Không thêm analytics, dependency, đăng nhập hoặc tích hợp ngoài chỉ để thay thương hiệu. Tuân thủ ủy quyền và quy trình triển khai hiện có của người dùng; gói hướng dẫn này tự nó không cấp quyền deploy hay truy cập hệ thống khác.

## Đầu ra AI cần trả

Tóm tắt đổi nhận diện ở đâu; liệt kê file thay; báo build/check và ảnh màn hình thực tế; nêu rõ local hay deployed, URL nếu có, và các vấn đề còn lại. Giữ asset nguồn trong dự án để có thể bảo trì.
