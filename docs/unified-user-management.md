# Trung tâm Người dùng

Đặc tả: `HUONG_DAN_AGENT_HOP_NHAT_QUAN_LY_NGUOI_DUNG_ZEPLAO.md` (17/11/2026).

## Bản đồ khảo sát

| Tính năng | File hiện có | Nguồn và kiểm tra máy chủ | Thay đổi |
| --- | --- | --- | --- |
| Tài khoản | AdminUsersPage, profileService | profiles; is_admin; admin_update_profile chặn tự sửa, giữ admin cuối | Một truy vấn phân trang dùng chung với phân quyền |
| Quyền Link ảnh | ProductLinkAccessTab, productLinkService | product_link_access PK user_id; product_links_level kiểm tra khóa trước admin/quyền trực tiếp; RLS và import RPC | Chuyển UI vào Người dùng; xem lại và kiểm tra snapshot trước lưu |
| Nhật ký | AdminUserDrawer, ProductLinkLogsTab | admin_audit_log; product_link_logs grant/revoke có trước/sau; usage_private.config_audit | UNION truy vấn, không sao chép/xóa lịch sử |
| Ngoại lệ AI | AdminUsageConfig, adminUsageService | user_quota_overrides; effective_quota; ledger ngày/tháng Asia/Ho_Chi_Minh | Chỉnh trong hồ sơ; cấu hình chung chỉ dẫn tới hồ sơ |
| Xác minh | AdminUserEditModal, admin_update_profile | profiles.is_verified là cờ hồ sơ admin chỉnh; không đồng bộ auth.email_confirmed_at | Nhãn Xác minh hồ sơ, không dùng để cấp quyền |
| Hoạt động | AuthContext, userActivity | profiles.last_active_at: tương tác/tab hiện, giới hạn mỗi phút; last_login_at riêng | Ghi rõ phạm vi và phân biệt chưa có bản ghi/chưa thu thập/lỗi |

Không có AGENTS.md ở workspace hoặc các thư mục cha. Git sạch khi bắt đầu. Workspace chỉ cấu hình client Supabase; chưa có kết nối quản trị để đối chiếu hoặc triển khai database thật. Mọi kiểm thử thay quyền dùng database kiểm thử độc lập.

## Kết quả P0 và P1

- `/admin/users?tab=list`: bảng 8 cột, cột danh tính/thao tác dễ truy cập, tên/email dài có tooltip; lọc tài khoản, vai trò, gói, xác minh hồ sơ, quyền hiệu lực, ngoại lệ AI. Bộ lọc, phân trang, sắp xếp, tab, ID hồ sơ và mục hồ sơ lưu trong URL.
- `/admin/users?tab=permissions&tool=product-links`: dùng cùng `admin_user_directory` với bảng tài khoản. Chọn trên trang hiện tại; admin bị loại khỏi thao tác cấp trực tiếp và có lý do. Quyền `checker` chỉ đổi nhãn thành Cộng tác.
- Hồ sơ bốn mục: Tổng quan, Quyền công cụ, Gói & hạn mức, Lịch sử. Hiển thị quyền trực tiếp, hiệu lực, nguồn, người cấp, thời gian và ghi chú trong lịch sử hiện có. Khóa luôn chặn hiệu lực; không xóa bản ghi quyền. Khi hạ admin, xem trước quyền trực tiếp còn lại.
- Lưu quyền và ngoại lệ AI có bản nháp, Hủy, xem lại, Lưu, chống gửi trùng, giữ bản nháp khi lỗi, thông báo xung đột và tải lại có cảnh báo bỏ bản nháp. Đóng/chuyển mục khi có sửa đổi phải xác nhận bỏ; đóng tab/tải lại được cảnh báo trước khi rời trang. Drawer có focus trap, trả focus, rộng 760px desktop, toàn chiều rộng mobile, Lưu/Đóng không bị khuất.
- Nhật ký quản trị UNION từ `admin_audit_log`, grant/revoke trong `product_link_logs`, ngoại lệ trong `usage_private.config_audit`. Lịch sử cá nhân có Quản trị/Công việc/Tất cả, gồm hoạt động Link ảnh và usage. Tìm được người thực hiện/đối tượng bằng tên/email/ID; có bộ lọc ID riêng, trước/sau, ghi chú, ID sự kiện, mã lô. Không nhân bản lịch sử hoặc tự bổ sung giá trị trước cho log cũ.
- Quyền, khóa hàng loạt là giao dịch nguyên khối. Snapshot cũ hoặc đối tượng không hợp lệ từ chối cả lô; audit cùng transaction. Khóa/mở hàng loạt có mã lô; vẫn giữ luật không tự sửa và bảo vệ admin cuối từ RPC cũ.
- Ngoại lệ AI chỉ chỉnh trong hồ sơ; trang Usage giữ cấu hình chung, model, mặc định gói, giá, ngân sách và dẫn tới hồ sơ. NULL kế thừa, 0 là hạn mức 0, unlimited bỏ cả hai giới hạn. Xóa ngoại lệ DELETE bản ghi thật. Hiển thị công tắc cưỡng chế và usage ngày/tháng Việt Nam. Không đổi hàm `effective_quota`, AI begin, idempotency, retry, giá/model hay cách đếm.
- `/admin/product-links`: sản phẩm, tiến độ, ghim, nhật ký công việc; nút Quản lý quyền dẫn sang Người dùng. `?tab=permissions` chuyển hướng và giữ bộ lọc; mặc định không còn rơi vào tab đã bỏ. Log công việc lọc grant/revoke ở server, không lọc sau khi phân trang.
- RLS/import RPC hiện có vẫn kiểm tra quyền tại database cho mỗi yêu cầu. Công cụ kiểm tra lại quyền khi trở lại tab, định kỳ 30 giây khi tab hiện, và trước copy/export từ dữ liệu đang mở. API vẫn chặn ngay dù client chưa nhận thay đổi. Dữ liệu đã được tải/chép ra bên ngoài trước khi thu hồi không thể thu lại.
- Mọi ngày giờ quản trị hiển thị Asia/Ho_Chi_Minh. Hoạt động gần nhất là mốc tương tác ứng dụng/tab hiển thị của tài khoản đăng nhập, không phải tổng hợp lịch sử đa công cụ; NULL có nghĩa chưa có bản ghi từ khi thu thập. Phạm vi ghi ngay trong Tổng quan; lỗi tải được hiển thị riêng.

## Mã nguồn và API

Root router chuyển sang `createBrowserRouter`/`RouterProvider` với cùng cây `<App />`/Routes để `UnsavedNavigationGuard` dùng blocker cho Back/Forward và điều hướng SPA. Không đổi route sản phẩm hay quy tắc bảo vệ route. Test UI dùng data memory router kiểm tra giữ/bỏ bản nháp khi Back, bao gồm không có lỗi router boundary.

`userManagementService.js` là lớp RPC dùng chung. Các RPC mới: `admin_user_directory`, `admin_user_detail`, `admin_user_center_stats`, `admin_user_history`, `admin_user_set_access`, `admin_user_set_quota`, `admin_user_update_profile`, `admin_user_bulk_status`, `admin_product_link_work_logs`.

Public wrappers dùng invoker; triển khai có quyền nâng cao nằm trong `user_admin_private`, `search_path=''`, kiểm tra `require_admin`. Hai helper hàng dữ liệu không được cấp cho browser; dùng invoker không SET để planner đẩy bộ lọc vào bảng gốc. Schema private không được thêm vào danh sách schema Data API exposed. Không thêm service credential vào client.

Migration bổ sung `note`, `batch_id` cho audit tài khoản, index truy vấn lịch sử và các hàm/trigger. Không drop bảng/cột, đổi cấp quyền, reset dữ liệu hoặc đổi retention. Grant/revoke tiếp tục ở log quyền hiện tại; chỉ copy giữ 14 ngày. Các RPC cũ được giữ để tương thích rollback, nhưng không còn UI chỉnh trùng.

## Bảo toàn và đối chiếu

`tests/unifiedUsersDatabase.test.mjs` khởi tạo schema/RLS thật trong PGlite, seed quyền, ngoại lệ, lịch sử; so sánh dữ liệu theo ID và fingerprint trước/sau chạy migration **hai lần**. Tài khoản/vai trò/trạng thái/gói/credits, quyền trực tiếp, ngoại lệ, số log quyền/hạn mức và usage đều không đổi do migration.

`scripts/userManagementReconcile.sql` chạy read-only để đối chiếu counts/fingerprints ở môi trường đích, không xuất dữ liệu cá nhân thô. Đã chạy trong test trước/sau migration và khớp. Chưa chạy trên production do chưa có kết nối quản trị. Nếu có hoạt động hợp lệ giữa hai lần đối chiếu, cần giải thích chênh lệch bằng ID/sự kiện trong khoảng đó; không khôi phục snapshot cũ đè lên thay đổi mới.

## Kiểm chứng

Kết quả lượt bàn giao: **26/26** ca Người dùng, **21/21** ca Link ảnh, **50/50** ca Usage qua; lint, build và `git diff --check` qua. Kiểm tra Chrome xác nhận mobile 390px không tràn ngang trang, nút Lưu nằm trong viewport, Shift+Tab/Tab giữ focus trong drawer; Back khi có bản nháp cho phép giữ dữ liệu hoặc bỏ và rời đi. Ảnh chụp dùng dữ liệu kiểm thử.

- `npm run test:admin-users`: database + React/service integration cho bảo toàn, quyền kế thừa/khóa, xác minh/gói không cấp quyền, CAS quyền/tài khoản/quota, giao dịch lô/audit, 0/NULL/unlimited/xóa ngoại lệ, các cấp quyền, chống tự nâng quyền, tìm/lọc/URL/Back/Forward/CSV, lỗi và bản nháp.
- `npm run test:product-links`: parser/Excel, database RLS/import/companies, UI và chặn copy cached sau khi thu hồi quyền.
- `npm run test:usage`: giữ nguyên kiểm tra ledger, retry/idempotency, quota, ranh giới ngày Việt Nam, model theo gói, cấu hình chung và dashboard.
- `npm run lint`, `npm run build`. Dự án JavaScript không có lệnh typecheck riêng.
- Trình duyệt Chrome qua Playwright CLI: desktop 1440×1000, mobile 390×844, xem lại/Lưu quyền, tab hồ sơ, Back/Forward, focus trap, vị trí nút Lưu và lỗi console. Môi trường localhost chỉ dùng transport kiểm thử và địa chỉ `@test.invalid`; không sửa quyền thật.

Ảnh xem lại ở `output/playwright/user-center-desktop.png`, `user-permission-review.png`, `user-permissions-mobile.png`, `user-quota-mobile.png` (thư mục artifact không commit). Chạy `npm run preview:admin-users`, mở `http://127.0.0.1:5179/admin/users` để kiểm tra lại bằng dữ liệu giả lập. Entry này chỉ nằm trong tests, không được import vào ứng dụng production.

Giới hạn: PGlite mô phỏng snapshot cũ của hai admin; chưa chạy hai kết nối Postgres mạng thực, Realtime/Security Advisors trên project thật, hoặc deploy. Sau triển khai cần smoke test bằng hai tài khoản kiểm thử được cấp phép. Không tuyên bố dữ liệu production đã đối chiếu hoặc tính năng đã chạy trên website thật.

## Triển khai và rollback

Kiểm tra mở rộng component Dialog/Avatar: 17/18 ca qua. Một lỗi đã có ở commit nền `15557bd7b1347c84621bf72825baa0be5e7efd54`: `tests/adminAvatarFramesUI.test.mjs:148` mong chuỗi giới hạn **2 MB**, trong khi `supabase/functions/avatar-frame-inspect/frameImage.js:13` đặt `maxBytes: 10 * 1024 * 1024`, UI hiển thị **10 MB**. Xác nhận bằng `git show HEAD:<path>` ở cả hai file. Hai file này và editor không được sửa trong đợt hợp nhất. Các kiểm thử Người dùng, Link ảnh, Usage không gặp lỗi này. Không thay nghiệp vụ upload avatar để làm xanh một kiểm thử ngoài phạm vi.

1. Ở project Supabase đích, bảo đảm đã có các SQL/migration profile/admin, plan, product links + companies, usage ledger/admin, và `20261117024756_user_last_activity.sql` của lần bổ sung hoạt động trước. Không chạy lại SQL Link ảnh gốc sau migration companies.
2. Chạy `scripts/userManagementReconcile.sql` read-only và lưu kết quả nội bộ.
3. Áp dụng **toàn bộ** `supabase/migrations/20261117034512_unified_user_management.sql` trong SQL Editor hoặc pipeline migration đã cấu hình. Migration transaction, idempotent, tự reload schema PostgREST. Không có biến môi trường mới.
4. Chạy lại đối chiếu, Security/Performance Advisors của project, rồi triển khai frontend. Kiểm tra URL cũ, bộ lọc, tài khoản khóa, đổi/thu hồi quyền từ hai phiên kiểm thử và hạn mức/quota flag.
5. Nếu cần rollback, triển khai lại artifact frontend trước thay đổi (mốc nguồn trước triển khai: `15557bd7b1347c84621bf72825baa0be5e7efd54`). **Giữ backend bổ sung và dữ liệu mới**: RPC cũ vẫn tồn tại và gọi được; giữ trigger/index/cột thêm, quyền/ngoại lệ/audit mới. Không dùng database reset, không xóa schema/tables/log, không import snapshot trước triển khai. Nếu muốn dọn phần bổ sung về sau, cần migration riêng sau khi mọi client đã rời phiên bản mới.

Workspace chưa có kết nối quản trị Supabase: các bước 2–4 tại môi trường thật chưa thực hiện. Bản thay đổi trong repository và kiểm chứng local đã sẵn sàng để xem lại.
