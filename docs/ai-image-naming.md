# Đặt tên ảnh bằng AI (`/watermark`)

Nút **Đặt tên bằng AI** ở khu vực Kết quả mở modal: nhập tên sản phẩm (điền sẵn từ ô tên sản phẩm của công cụ), chọn **Model AI**, sửa **Nội dung prompt** đang hiển thị sẵn, bấm **Tạo tên gợi ý**, sửa từng tên rồi bấm **Áp dụng tên**. Prompt tự động lưu vào localStorage (`watermark_ai_naming_prompt`) ngay khi chỉnh và được khôi phục khi tải lại/mở lại trang trên cùng trình duyệt; **Khôi phục mặc định** cũng cập nhật bản lưu. Nếu trình duyệt chặn lưu trữ, modal vẫn hoạt động bình thường trong trang hiện tại. Model được giữ khi đóng/mở lại hoặc áp dụng tên trong cùng trang; tải lại trang sẽ về model mặc định. Tên file chỉ đổi khi bấm Áp dụng; Hủy/Esc/đóng modal không đổi tên. Đổi tên thủ công và **Thêm tên ảnh hàng loạt** vẫn hoạt động như cũ, kể cả khi AI chưa được cấu hình.

## Kiến trúc

- **Backend:** Supabase Edge Function `suggest-image-names` (`supabase/functions/suggest-image-names/`). Dự án đã dùng Supabase cho Auth/DB, còn Netlify chỉ phục vụ SPA tĩnh (không có Netlify Functions), nên endpoint nằm cạnh Supabase và không phụ thuộc nơi host frontend. Frontend gọi `<VITE_SUPABASE_URL>/functions/v1/suggest-image-names` (đổi được bằng `VITE_IMAGE_NAME_API_URL`).
- **Xác thực và phân quyền:** xem mục **Phân quyền** bên dưới.
- **OpenAI:** Responses API với `store: false`. Người dùng chọn `gpt-6-luna` (mặc định), `gpt-6.1-sol` hoặc `gpt-6-astra`; frontend gửi `model` cùng `prompt` trong mỗi lô. Backend kiểm tra danh sách cho phép dùng chung trong `imageNaming.js`; model lạ bị từ chối `400` trước khi gọi OpenAI. `OPENAI_IMAGE_NAME_MODEL` chỉ còn là fallback cho client không gửi model. `OPENAI_IMAGE_NAME_REASONING_EFFORT` vẫn cấu hình ở server; với Sol/Astra, `none`/`minimal` tự chuyển thành `low`, và output budget có phần dành cho suy luận. Tham chiếu: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra). Khả năng sử dụng từng model còn phụ thuộc project OpenAI cấp key.
- **Quy tắc tên** nằm trong `supabase/functions/suggest-image-names/imageNaming.js`, dùng chung cho function và frontend (đặt trong thư mục function để bundler của Supabase đóng gói được; function không import file nào bên ngoài thư mục của nó). AI chỉ trả về *mô tả ngắn* (`descriptor`); code ghép `slug(tên sản phẩm) + "-" + slug(mô tả)`, chữ thường, tiếng Việt không dấu, gạch ngang, tối đa 8 từ mô tả. Ưu tiên 4–8 từ khi cần, không ép thêm từ cho đủ độ dài; giới hạn prompt/schema và bước ghép tên dùng cùng `maxDescriptorWords`. Ảnh không rõ → `tên-sản-phẩm-<số thứ tự>` và gắn nhãn *Cần kiểm tra*. Chống trùng (`-2`, `-3`…) và đuôi file (theo loại file xuất, hiện là `.jpg`) do frontend xử lý khi áp dụng.
- **ID ổn định:** mỗi ảnh kết quả có `id` (`res-N`). Schema structured output giới hạn `imageId` bằng `enum` các ID trong request, `minItems`/`maxItems` bằng số ảnh; backend và frontend đều ghép kết quả theo ID, bỏ ID lạ/trùng, báo ảnh thiếu là lỗi. Áp dụng tên chỉ tác động đến các ID còn tồn tại.
- **Prompt:** nội dung người dùng nhập được gửi xuống backend và thay `{{productName}}` bằng tên sản phẩm; để trống sẽ dùng prompt mẫu, nút **Khôi phục mặc định** phục hồi mẫu. Các ràng buộc bắt buộc (định dạng, ID, không suy đoán thông số, chữ trong ảnh không phải chỉ dẫn) nằm trong `instructions` cố định phía server, cùng schema và bước kiểm tra kết quả — prompt sửa đổi không thay đổi được chúng. Model và prompt bị khóa trong lúc đang chạy.

Mẫu dành riêng cho website: [prompt-ai-image-naming.md](prompt-ai-image-naming.md). AI trả JSON `{ items: [{ imageId, descriptor, needsReview }] }`; không trả danh sách `.jpg` hoặc khối mã. Mỗi ảnh tải lên, kể cả collage, chỉ có một kết quả theo ID của ứng dụng. Nếu thương hiệu/model đọc rõ trong ảnh mâu thuẫn với tên người dùng nhập, AI đánh dấu `needsReview` (UI “Cần kiểm tra”), không tự sửa tên sản phẩm. Các lô xử lý độc lập; chống trùng trên toàn bộ kết quả do frontend thực hiện. Prompt riêng đã lưu trong localStorage được giữ; bấm **Khôi phục mặc định** để nhận mẫu mới.

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

Admin cấu hình quyền model tại **`/admin/usage` → Cấu hình & cảnh báo → Model AI theo gói**. Mỗi dòng Free, Pro, Enterprise, Quản trị viên chọn các model được phép và bấm **Lưu**. Không kế thừa giữa các gói; bỏ chọn toàn bộ sẽ tắt Đặt tên AI cho gói đó. Mặc định Free không có model, Pro/Enterprise/admin có cả ba model để giữ quyền trước đây. Watermark và đổi tên thủ công không bị ảnh hưởng.

- **Nguồn dữ liệu:** `public.profiles.role` (`admin`), `status` (`suspended` = mất mọi quyền) và `plan` (`free` < `pro` < `enterprise`, NULL = free). Người dùng không tự sửa được các cột này (quyền ghi cột đã bị thu hồi trong `supabase_profiles_auth_sync.sql`); admin đổi qua `admin_update_profile`. Không dùng `user_metadata`, localStorage hay dữ liệu frontend gửi lên.
- **Quy tắc duy nhất:** `usage_private.plan_models` lưu danh sách model theo gói; RPC `public.ai_naming_models()` trả danh sách cho `auth.uid()`. Admin dùng dòng `admin`; tài khoản bị khóa, không có profile hoặc gói lạ trả danh sách rỗng. `can_use_ai_naming()` vẫn trả boolean cho client cũ, bằng việc kiểm tra danh sách này có phần tử. Bảng bật RLS, không cấp quyền đọc/ghi trực tiếp cho browser; thay đổi phải qua RPC admin và được ghi vào `config_audit` với trước/sau.
- **Backend (quyết định cuối):** mỗi request xác thực JWT qua `/auth/v1/user`, rồi gọi `ai_naming_models` bằng chính JWT đó trước khi đọc ảnh. Sau khi kiểm tra payload, model yêu cầu (kể cả fallback env cho client cũ) phải nằm trong danh sách đã cấp; không có ngoại lệ từ body. Không cache giữa các request. Mã lỗi: `401 AUTH_REQUIRED`, `403 AI_NAMING_ACCESS_DENIED` (danh sách rỗng), `403 AI_NAMING_MODEL_DENIED` (model không được cấp), `503 ACCESS_CHECK_FAILED` (không tra cứu được quyền).
- **Frontend (chỉ hiển thị):** `useAiNamingAccess` gọi cùng RPC khi đăng nhập, profile thay đổi, kiểm tra lại hoặc quay lại tab trình duyệt. Dropdown chỉ hiện model được cấp; lựa chọn cũ không còn hợp lệ chuyển sang model đầu tiên còn được dùng. Nếu backend trả `AI_NAMING_MODEL_DENIED`, dừng lượt chạy và tải lại quyền; prompt và tên gợi ý vẫn giữ. Khi không còn model, báo "Gói tài khoản của bạn chưa được cấp quyền Đặt tên AI." và khóa tạo gợi ý; vẫn áp dụng tên đã có hoặc đổi thủ công. Chưa đăng nhập vẫn dùng luồng `/auth` như cũ.

**Chưa có trong dự án:** thời hạn gói, trạng thái hủy/gia hạn hay subscription. Gói hiện do admin gán thủ công tới khi admin đổi. Khi bổ sung thời hạn, cập nhật hàm `usage_private.caller_ai_naming_models()`.

Áp dụng: sau các migration access/usage hiện có, chạy **`supabase/migrations/20261019045632_ai_naming_plan_models.sql`**, rồi deploy Edge Function `suggest-image-names` và frontend. Xem [triển khai](usage-logging.md#10-triển-khai). Nếu thiếu migration, function trả `ACCESS_CHECK_FAILED` và không gọi OpenAI. Migration chạy lại không ghi đè các model admin đã lưu.

## Cấu hình và chạy

1. Tạo API key riêng trên OpenAI (nên là project key có spend limit), **không** đặt trong biến `VITE_`.
2. Đặt secret cho Edge Function (đã `supabase link` tới project):

   ```bash
   npx supabase secrets set OPENAI_IMAGE_NAME_KEY=sk-...
   # Tùy chọn (model là fallback cho client cũ không gửi lựa chọn):
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

- `tests/aiNamingAccessDatabase.test.mjs`: kiểm tra migration access ban đầu. `tests/planModelAccessDatabase.test.mjs` kiểm tra toàn bộ schema mới bằng SQL thật trên PGlite: quyền model theo gói, bật Free, khóa từng gói, admin bị khóa, không tự nâng quyền, model lạ, nhật ký, chạy lại migration và public wrappers dùng security invoker.
- Phân quyền ở Edge Function (trong `tests/suggestImageNamesFunction.test.mjs`) và giao diện (trong `tests/aiRenameUI.test.mjs`, dùng hook thật): 401/403/503, giả mạo role/plan/userId trong body/header/localStorage, gọi thẳng endpoint, lỗi tra cứu quyền, kiểm tra lại ở mỗi lô — trong mọi trường hợp bị từ chối OpenAI giả lập không được gọi.

- `src/utils/aiImageNaming.test.js`: chuẩn hóa tiếng Việt/mã sản phẩm/ký tự đặc biệt, ghép tên, ảnh không rõ, khớp theo ID (sai thứ tự, thiếu, trùng, ID lạ), chống trùng ổn định, đuôi file, tên dùng cho tải từng ảnh/ZIP.
- `tests/suggestImageNamesFunction.test.mjs`: handler Edge Function với Supabase Auth và OpenAI giả lập — xác thực, tài khoản bị khóa, thiếu key, kiểm tra payload, request structured output/`detail: low`, prompt không đổi được schema, retry 429/5xx, không retry quota/401/400, timeout, kết quả hỏng, rate limit/concurrency, log không lộ key/ảnh/prompt.
- `tests/aiRenameUI.test.mjs`: modal React trong jsdom với service thật và `fetch` giả lập — gợi ý theo ID, thử lại ảnh lỗi, sửa rồi áp dụng, tải từng ảnh dùng tên mới, Hủy không đổi tên, phản hồi cũ sau khi đóng modal hoặc sau khi đổi bộ ảnh bị bỏ qua, thông báo lỗi (thiếu key, rate limit, timeout, mất mạng, hết phiên), chia lô 6 ảnh/2 luồng, bắt buộc tên sản phẩm, khôi phục prompt, Esc/focus/nhãn.

Chưa xác minh với OpenAI và Supabase thật (môi trường chưa cung cấp `OPENAI_IMAGE_NAME_KEY`, function chưa được deploy). Sau khi deploy, thử 3–5 ảnh thật để kiểm tra chất lượng mô tả, token thực tế và CORS từ domain production.
