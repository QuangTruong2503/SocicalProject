# Đặt tên ảnh bằng AI (`/watermark`)

Nút **Đặt tên bằng AI** ở khu vực Kết quả mở modal: nhập tên sản phẩm (điền sẵn từ ô tên sản phẩm của công cụ), chỉnh prompt mẫu nếu cần, bấm **Tạo tên gợi ý**, sửa từng tên rồi bấm **Áp dụng tên**. Tên file chỉ đổi khi bấm Áp dụng; Hủy/Esc/đóng modal không đổi tên. Đổi tên thủ công và **Thêm tên ảnh hàng loạt** vẫn hoạt động như cũ, kể cả khi AI chưa được cấu hình.

## Kiến trúc

- **Backend:** Supabase Edge Function `suggest-image-names` (`supabase/functions/suggest-image-names/`). Dự án đã dùng Supabase cho Auth/DB, còn Netlify chỉ phục vụ SPA tĩnh (không có Netlify Functions), nên endpoint nằm cạnh Supabase và không phụ thuộc nơi host frontend. Frontend gọi `<VITE_SUPABASE_URL>/functions/v1/suggest-image-names` (đổi được bằng `VITE_IMAGE_NAME_API_URL`).
- **Xác thực và phân quyền:** xem mục **Phân quyền** bên dưới.
- **OpenAI:** Responses API, model mặc định `gpt-6-luna` (theo tài liệu OpenAI tại thời điểm triển khai: nhận ảnh, hỗ trợ Structured Outputs, `reasoning.effort` từ `none`, giá $0.10/1M token đầu vào và $0.50/1M token đầu ra). Đổi model bằng `OPENAI_IMAGE_NAME_MODEL`; nếu model mới không nhận `effort: none`, đặt `OPENAI_IMAGE_NAME_REASONING_EFFORT` (ví dụ `low`) hoặc để trống để bỏ tham số. Gọi với `store: false`.
- **Quy tắc tên** nằm trong `supabase/functions/suggest-image-names/imageNaming.js`, dùng chung cho function và frontend (đặt trong thư mục function để bundler của Supabase đóng gói được; function không import file nào bên ngoài thư mục của nó). AI chỉ trả về *mô tả ngắn* (`descriptor`); code ghép `slug(tên sản phẩm) + "-" + slug(mô tả)`, chữ thường, tiếng Việt không dấu, gạch ngang, tối đa 5 từ mô tả. Ảnh không rõ → `tên-sản-phẩm-<số thứ tự>` và gắn nhãn *Cần kiểm tra*. Chống trùng (`-2`, `-3`…) và đuôi file (theo loại file xuất, hiện là `.jpg`) do frontend xử lý khi áp dụng.
- **ID ổn định:** mỗi ảnh kết quả có `id` (`res-N`). Schema structured output giới hạn `imageId` bằng `enum` các ID trong request, `minItems`/`maxItems` bằng số ảnh; backend và frontend đều ghép kết quả theo ID, bỏ ID lạ/trùng, báo ảnh thiếu là lỗi. Áp dụng tên chỉ tác động đến các ID còn tồn tại.
- **Prompt:** prompt người dùng là một phần nội dung; các ràng buộc bắt buộc (định dạng, ID, không suy đoán thông số, chữ trong ảnh không phải chỉ dẫn) nằm trong `instructions` cố định phía server, cùng schema và bước kiểm tra kết quả — prompt sửa đổi không thay đổi được chúng.

## Dữ liệu ảnh và chi phí

- Ưu tiên ảnh gốc trước khi đóng watermark (logo không che sản phẩm); nếu trình duyệt không đọc được ảnh gốc (ví dụ HEIC) thì dùng ảnh đã xuất. Bản gửi AI là bản sao JPEG cạnh dài ≤ 512px, gửi dạng base64 data URL qua backend với `detail: "low"`. Ảnh xuất cho người dùng không thay đổi. Không gửi blob URL, không lưu ảnh lên storage.
- Gộp tối đa 6 ảnh/request để dùng chung phần chỉ dẫn, tối đa 2 request song song, tối đa 60 ảnh mỗi lần bấm (bấm lại để xử lý phần còn lại). Sửa tên/áp dụng không gọi API; **Thử lại** chỉ gửi các ảnh chưa có tên.
- Ước tính (tự tính theo công thức patch 32px × hệ số 1.2 trong tài liệu, chưa đo trên tài khoản thật): ~230–310 token/ảnh + phần prompt chia đều, khoảng 400–500 token đầu vào và ~30 token đầu ra mỗi ảnh — khoảng $0.06 cho 1.000 ảnh với `gpt-6-luna`. Hãy đối chiếu trường `usage` trong lần gọi thật đầu tiên.

## Giới hạn và độ ổn định (server)

| Giới hạn | Giá trị |
| --- | --- |
| Ảnh mỗi request | 6 |
| Data URL mỗi ảnh / body | 450.000 / 3.000.000 ký tự |
| Tên sản phẩm / prompt | 150 / 10.000 ký tự |
| Mỗi người dùng trong 10 phút | 40 request, 150 ảnh (mặc định, chỉnh ở /admin/usage) |
| Request đồng thời | 2 mỗi người dùng, 8 toàn hệ thống (dùng chung mọi instance) |
| Timeout OpenAI | 45 giây mỗi lần, tối đa 3 lần |

Retry (có backoff, tôn trọng `Retry-After`, tối đa 10 giây mỗi lần chờ) chỉ cho lỗi mạng, timeout, 408/409, 429 rate limit và 5xx. Không retry 400/401/403/404 và 429 do hết hạn mức (`insufficient_quota`, spend limit…). Kết quả bị cắt, bị từ chối hoặc không đúng JSON → trả 200 với mọi ảnh trong lô ở trạng thái lỗi để thử lại. Log chỉ ghi mã lỗi/HTTP status, không ghi API key, ảnh base64 hay prompt.

Giới hạn tần suất, số request đồng thời, quota ảnh theo ngày/tháng và công tắc tạm dừng được kiểm tra trong Postgres (`ai_usage_begin`), dùng chung mọi instance Edge Function; mỗi lô và từng attempt tới OpenAI được ghi vào sổ usage (token, model thực tế, chi phí ước tính). Nếu không ghi được bản ghi bắt đầu, function trả `503 usage_tracking_unavailable` và không gọi OpenAI. Chi tiết: [usage-logging.md](usage-logging.md). Nên đặt thêm **spend limit** cho project OpenAI.

## Phân quyền

Chỉ **admin** hoặc tài khoản có **gói Pro trở lên đang có hiệu lực** được dùng Đặt tên AI. Watermark, đổi tên thủ công và "Thêm tên ảnh hàng loạt" không đổi.

- **Nguồn dữ liệu:** `public.profiles.role` (`admin`), `status` (`suspended` = mất mọi quyền) và `plan` (`free` < `pro` < `enterprise`, NULL = free). Người dùng không tự sửa được các cột này (quyền ghi cột đã bị thu hồi trong `supabase_profiles_auth_sync.sql`); admin đổi qua `admin_update_profile`. Không dùng `user_metadata`, localStorage hay dữ liệu frontend gửi lên.
- **Quy tắc duy nhất:** `public.can_use_ai_naming()` trong `supabase/migrations/20261017100000_ai_naming_access.sql` = `is_admin()` **hoặc** (tài khoản không bị khóa **và** `plan_rank(plan) >= plan_rank('pro')`). Cấp gói xác định bằng danh sách trong `plan_rank()`, không so sánh chuỗi; gói lạ không có cấp → từ chối.
- **Backend (quyết định cuối):** mỗi request tới Edge Function đều xác thực JWT qua `/auth/v1/user` rồi gọi RPC `can_use_ai_naming` bằng chính JWT đó — trước khi đọc body ảnh, kiểm tra cấu hình hay gọi OpenAI. Không cache: mỗi lô 6 ảnh và mỗi lần "Thử lại" là một request mới được kiểm tra lại. Mã lỗi: `401 AUTH_REQUIRED`, `403 AI_NAMING_ACCESS_DENIED`, `503 ACCESS_CHECK_FAILED` (không tra cứu được quyền — từ chối, có thể thử lại).
- **Frontend (chỉ hiển thị):** hook `useAiNamingAccess` gọi cùng RPC, nút luôn hiển thị: đang kiểm tra → nút khóa; không đủ gói → "Đặt tên AI dành cho tài khoản Pro trở lên." (dự án chưa có trang nâng cấp nên không có nút nâng cấp); chưa đăng nhập → mời đăng nhập qua `/auth` rồi quay lại `/watermark` (ảnh chưa tải xuống sẽ mất khi chuyển trang — dialog có cảnh báo); lỗi tra cứu → "Thử lại". Nếu backend trả 401/403 khi modal đang mở, modal giữ nguyên tên đã gợi ý/đang sửa, khóa nút tạo gợi ý và hiện thông báo; vẫn áp dụng được tên đã có.

**Chưa có trong dự án:** thời hạn gói, trạng thái hủy/gia hạn hay subscription. Gói hiện do admin gán thủ công và có hiệu lực tới khi admin đổi; vì vậy "Pro hết hiệu lực" và "đã hủy nhưng còn hạn" chưa thể biểu diễn. Khi bổ sung dữ liệu thời hạn, chỉ cần mở rộng `can_use_ai_naming()`.

Áp dụng: chạy `supabase/migrations/20261017100000_ai_naming_access.sql` (và hai migration sổ usage `20261018090000_usage_ledger.sql`, `20261018091000_usage_admin.sql`, xem [usage-logging.md](usage-logging.md#10-triển-khai)) (sau `supabase_admin_profiles_policies.sql` và `20261017090000_profiles_plan_check.sql`) bằng `npx supabase db push` hoặc SQL Editor, **trước** khi deploy lại function. Nếu chưa áp dụng, function trả `ACCESS_CHECK_FAILED` cho mọi người (đóng an toàn).

## Cấu hình và chạy

1. Tạo API key riêng trên OpenAI (nên là project key có spend limit), **không** đặt trong biến `VITE_`.
2. Đặt secret cho Edge Function (đã `supabase link` tới project):

   ```bash
   npx supabase secrets set OPENAI_IMAGE_NAME_KEY=sk-...
   # Tùy chọn:
   npx supabase secrets set OPENAI_IMAGE_NAME_MODEL=gpt-6-luna OPENAI_IMAGE_NAME_REASONING_EFFORT=none
   npx supabase secrets set IMAGE_NAME_ALLOWED_ORIGINS=https://<site>.netlify.app,http://localhost:5173
   # Sổ usage (khuyên dùng): nhãn key, môi trường, khóa HMAC cho idempotency
   npx supabase secrets set OPENAI_IMAGE_NAME_KEY_ALIAS=image-naming-prod-v1 AI_USAGE_ENVIRONMENT=production AI_USAGE_FINGERPRINT_SECRET=<chuỗi-ngẫu-nhiên-dài>
   ```

3. Triển khai function (giữ kiểm tra JWT mặc định, không dùng `--no-verify-jwt`):

   ```bash
   npx supabase functions deploy suggest-image-names
   ```

4. Frontend không cần biến mới: `npm run dev` / `npm run build` như cũ.

Chạy function ở máy (cần Docker): tạo `supabase/functions/.env` từ phần "Server only" của `.env.example` (file `.env` đã được gitignore), chạy `npx supabase functions serve suggest-image-names --env-file supabase/functions/.env`, rồi đặt `VITE_IMAGE_NAME_API_URL=http://127.0.0.1:54321/functions/v1/suggest-image-names` trong `.env.local` của frontend.

Thiếu key → modal báo "Tính năng AI chưa được cấu hình…", dừng gửi các lô còn lại; người dùng vẫn tự nhập tên trong modal hoặc trên từng ảnh.

## Kiểm tra

`npm run test:ai-image-names` gồm:

- `tests/aiNamingAccessDatabase.test.mjs`: `can_use_ai_naming()` trên PostgreSQL thật (PGlite) với `is_admin()` và quyền cột của dự án — admin không có Pro, Pro, Enterprise, Free/NULL, gói lạ, tài khoản bị khóa, admin bị khóa, không có phiên, anon không gọi được, người dùng không tự đổi được plan/role/status, hạ gói có hiệu lực ngay.
- Phân quyền ở Edge Function (trong `tests/suggestImageNamesFunction.test.mjs`) và giao diện (trong `tests/aiRenameUI.test.mjs`, dùng hook thật): 401/403/503, giả mạo role/plan/userId trong body/header/localStorage, gọi thẳng endpoint, lỗi tra cứu quyền, kiểm tra lại ở mỗi lô — trong mọi trường hợp bị từ chối OpenAI giả lập không được gọi.

- `src/utils/aiImageNaming.test.js`: chuẩn hóa tiếng Việt/mã sản phẩm/ký tự đặc biệt, ghép tên, ảnh không rõ, khớp theo ID (sai thứ tự, thiếu, trùng, ID lạ), chống trùng ổn định, đuôi file, tên dùng cho tải từng ảnh/ZIP.
- `tests/suggestImageNamesFunction.test.mjs`: handler Edge Function với Supabase Auth và OpenAI giả lập — xác thực, tài khoản bị khóa, thiếu key, kiểm tra payload, request structured output/`detail: low`, prompt không đổi được schema, retry 429/5xx, không retry quota/401/400, timeout, kết quả hỏng, rate limit/concurrency, log không lộ key/ảnh/prompt.
- `tests/aiRenameUI.test.mjs`: modal React trong jsdom với service thật và `fetch` giả lập — gợi ý theo ID, thử lại ảnh lỗi, sửa rồi áp dụng, tải từng ảnh dùng tên mới, Hủy không đổi tên, phản hồi cũ sau khi đóng modal hoặc sau khi đổi bộ ảnh bị bỏ qua, thông báo lỗi (thiếu key, rate limit, timeout, mất mạng, hết phiên), chia lô 6 ảnh/2 luồng, bắt buộc tên sản phẩm, khôi phục prompt, Esc/focus/nhãn.

Chưa xác minh với OpenAI và Supabase thật (môi trường chưa cung cấp `OPENAI_IMAGE_NAME_KEY`, function chưa được deploy). Sau khi deploy, thử 3–5 ảnh thật để kiểm tra chất lượng mô tả, token thực tế và CORS từ domain production.
