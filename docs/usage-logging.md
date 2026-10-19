# Nhật ký sử dụng và theo dõi chi phí API

Áp dụng cho `/watermark` (tạo ảnh watermark và tải file trên thiết bị) và **Đặt tên ảnh bằng AI** (gọi OpenAI qua Edge Function `suggest-image-names`). Dashboard quản trị: `/admin/usage` (“Sử dụng & chi phí”).

Hệ thống trả lời được:

1. Ai tạo bao nhiêu ảnh, tải bao nhiêu ảnh, dùng đặt tên AI bao nhiêu lần, vào lúc nào.
2. Mỗi người dùng, model, môi trường, key alias phát sinh bao nhiêu request, attempt, token và chi phí ước tính.
3. Lỗi, retry, yêu cầu bị từ chối, hoặc đã tốn token mà kết quả không dùng được nằm ở đâu.
4. Có dấu hiệu dùng bất thường, vượt quota hay sắp vượt ngân sách không.

Ngoài phạm vi: AI sinh ảnh hay AI tự đặt tên thương mại cho sản phẩm (chưa có trong dự án). Cách đặt tên ảnh không thay đổi.

## 1. Hai loại dữ liệu, hai mức tin cậy

| | Activity telemetry | API usage ledger |
| --- | --- | --- |
| Bảng | `usage_private.usage_activity_events` | `usage_private.ai_usage_requests`, `usage_private.ai_usage_attempts` |
| Ai ghi | Trình duyệt, qua RPC `public.usage_log_activity` | Chỉ Edge Function, bằng khóa máy chủ (service role) |
| Nội dung | Tạo ảnh, tải ảnh, áp dụng tên AI | Request, từng attempt tới OpenAI, token, model thực tế, key alias, chi phí ước tính |
| Độ tin cậy | Có thể thiếu (mất mạng, đóng tab, chặn quảng cáo, chế độ riêng tư) hoặc bị giả mạo | Lấy từ JWT đã xác thực, cấu hình server và phản hồi OpenAI |
| Dùng cho | Phân tích sản phẩm | Theo dõi chi phí, quota, đối soát |

Không suy token/chi phí từ số lần bấm hay số ảnh tạo/tải. Chi phí vận hành Supabase không thể suy ra từ các số đếm này và không được hiển thị.

## 2. Sự kiện trên thiết bị (schema v1)

Dựng trong `src/utils/usageEvents.js`, gửi bởi `src/services/usageTelemetryService.js`.

| Action | Khi nào | Ghi chú |
| --- | --- | --- |
| `image.create` | Kết thúc một lần bấm “Tạo ảnh watermark” (`handleCreate`) | Một bản ghi tổng kết, không ghi từng ảnh |
| `image.download` | Kết thúc một lần tải: hàng loạt (`downloadAll`: ZIP / lần lượt, gốc / 800×600) hoặc nút “Tải xuống” trên từng ảnh (`ResultCard` → `onResultDownload`) | Một thao tác = một sự kiện, kể cả ZIP 20 ảnh |
| `ai.naming.apply` | Bấm “Áp dụng tên” trong hộp Đặt tên AI | Không phải lượt gọi AI; mở lại bản nháp không tạo sự kiện |

**Trường chính:** `eventId` (UUID, chống gửi trùng), `operationId`, `imageBatchId` (UUID gắn với bộ ảnh vừa tạo; ID `res-N` cũ chỉ là ID cục bộ), `aiRunId`, `subjectUserId`/`visitorId`, `feature`, `action`, `sourcePage`, `status`, các số đếm, `durationMs`, `errorCode` (mã cố định), `downloadMethod` (`single`/`direct`/`zip`), `imageSize` (`original`/`800x600`), `delivery`, `outputFileCount`, `imagesInFiles`, `occurredAt` (giờ trình duyệt, chỉ tham khảo). Máy chủ thêm `received_at` — mọi lọc và chia ngày dùng thời điểm này. `metadata` chỉ giữ khóa trong allowlist (`ai_unchanged_count`, `edited_count`, `batch_count`, `stage`), tối đa 512 byte; khóa khác bị bỏ.

**Định nghĩa số đếm** (`requested = succeeded + failed + skipped + cancelled`):

- `skipped`: ảnh không đọc được, không đưa vào xử lý.
- `cancelled`: chưa chạy / chưa giao vì người dùng bấm “Dừng lại”, rời trang hoặc hủy tải.
- `failed`: đã chạy nhưng lỗi.
- Với tải xuống: `prepared` = ảnh đã resize/thêm vào ZIP; `succeeded` = ảnh **thực sự** giao cho cơ chế tải.

**Ý nghĩa tải xuống:**

- Tải bằng anchor/blob: `delivery = browser_handoff` (“Đã gửi tới trình duyệt”) — ứng dụng chỉ biết đã kích hoạt tải, không biết file đã lưu xong.
- File System Access API: `delivery = file_written` (“Đã ghi file”) chỉ sau khi stream xong và `close()` thành công.
- Đóng hộp chọn nơi lưu: `status = cancelled`, `errorCode = picker_cancelled`, 0 ảnh.
- ZIP đã thêm ảnh nhưng bị hủy trước khi phát hành file: 0 ảnh đã tải.
- Lỗi chuẩn bị/đóng gói/ghi file: `prepare_failed` / `pack_failed` / `write_failed`, số ảnh đã giao trước lỗi được giữ (`partial`).
- Tải lại cùng ảnh là thao tác mới (sự kiện mới). Gửi lại telemetry của cùng thao tác dùng lại `eventId` và không tăng số.

**Chủ thể:** chốt khi thao tác bắt đầu. Tài khoản: `user_id = auth.uid()` do máy chủ xác định; sự kiện của tài khoản không lưu visitor ID (không nối lịch sử khách vào tài khoản). Khách: visitor ID ngẫu nhiên — không phải danh tính, không phải một người duy nhất. Máy chủ từ chối (`subject_mismatch`) sự kiện khai báo tài khoản khác JWT; tác vụ bắt đầu khi là khách vẫn ghi là khách dù người đó đăng nhập giữa chừng.

**Gửi best effort:** hàng đợi trong bộ nhớ + `localStorage` (chỉ ID và số đếm, không có ảnh/tên file/tên sản phẩm), tối đa 100 sự kiện, TTL 24 giờ, 5 lần thử với backoff 5 s → 5 phút, lô 25 sự kiện. Gửi lại khi trang mở lại, khi có mạng, khi ẩn tab. Sau khi đổi sang tài khoản khác, sự kiện còn tồn của tài khoản trước bị hủy, không gửi dưới danh tính mới. Telemetry lỗi không bao giờ chặn tạo/tải ảnh. **Không bảo đảm giao nhận tuyệt đối.**

**Giới hạn ingestion (máy chủ):** ≤ 50 sự kiện và ≤ 32 KB mỗi lần gọi; mỗi tài khoản/visitor ≤ `activity_max_events_per_minute` (mặc định 120) sự kiện/phút; tổng sự kiện khách ≤ 50× mức đó mỗi phút (visitor ID có thể đổi nên không phải khóa chống lạm dụng). Tài khoản bị khóa không ghi được.

## 3. Sổ API usage (máy chủ ghi)

### Ba tầng

1. **AI run** (`ai_run_id`): một lần bấm tạo gợi ý — chỉ để nhóm, do trình duyệt cung cấp.
2. **Logical request** (`ai_usage_requests`): một lô ≤ 6 ảnh được backend nhận xử lý, hoặc bị từ chối sau xác thực.
3. **Attempt** (`ai_usage_attempts`, unique `(request_id, attempt_number)`): mỗi lần thực sự gọi OpenAI, kể cả retry.

Ví dụ: 13 ảnh → 6 + 6 + 1 = 1 run, 3 request; một lô bị 429 rồi thành công → 4 attempt. Ảnh nghiệp vụ = 13; “lượt ảnh gửi provider” = 19 (chỉ số riêng).

### Luồng trong `handler.js`

1. Xác thực JWT (`/auth/v1/user`) và lấy model được cấp từ `ai_naming_models()` **mỗi request**, trước khi đọc ảnh; model trong payload phải thuộc danh sách đó. Không tin user/role/plan/key alias trong body.
2. Đọc và kiểm tra body. Từ chối sau xác thực (403, 400, 413, `not_configured`) được ghi thành request `rejected` (không có attempt), tối đa 200 bản ghi từ chối/giờ/người. 401 và lỗi ở gateway trước handler chỉ có trong log nền tảng.
3. `ai_usage_begin` trong **một transaction**, tuần tự hóa giữa mọi instance bằng advisory lock: dọn request treo, idempotency, công tắc dừng, giới hạn đồng thời, cửa sổ tần suất, quota ngày/tháng, rồi tạo request `running` có **lease**. Không ghi được bản ghi này → `503 usage_tracking_unavailable`, **không gọi OpenAI**.
4. Mỗi attempt: `ai_usage_attempt_start` ngay trước khi gọi; `ai_usage_attempt_finish` ngay sau phản hồi — **trước** `parseOpenAIOutput()`, trước lúc chờ retry — với HTTP status, `x-request-id`, response `id`, `model` thực tế, `service_tier`, `status`, `usage`.
5. `ai_usage_finish`: kết quả nghiệp vụ (`succeeded` / `partial` / `failed`), số ảnh thành công/lỗi/cần kiểm tra, kết quả tối thiểu để replay.

### Trạng thái

| | Giá trị |
| --- | --- |
| Request | `running`, `succeeded`, `partial`, `failed`, `rejected`, `unknown` |
| Attempt | `running`, `succeeded` (OpenAI trả 200), `failed` (OpenAI trả lỗi), `unknown` (timeout/mất kết nối/process chết) |
| `usage_status` | `reported`, `missing` (có phản hồi, không có usage), `unknown` (không có phản hồi — có thể đã tính phí), `not_called` |
| `cost_status` | `estimated`, `unpriced` (có token, chưa có giá khớp), `unknown` (không có usage), `not_applicable` |

Không có usage thì token để NULL, không điền 0. HTTP 200 nhưng mọi ảnh lỗi (bị cắt, từ chối, sai JSON, thiếu ID) là **thất bại nghiệp vụ** — usage vẫn được lưu. `needsReview` là chỉ số riêng, không phải lỗi API.

### Failure policy

- Ghi attempt/kết quả lỗi → thử lại tối đa 3 lần với cùng ID (ghi idempotent), log `[suggest-image-names] usage ledger write failed` (không có nội dung). **Không gọi lại OpenAI để khôi phục log.** Người dùng vẫn nhận tên.
- Request không được đóng (process bị kill, mất DB) giữ `running` tới khi lease hết hạn (mặc định 240 s, lớn hơn trường hợp xấu nhất 3 × 45 s + backoff), rồi được chuyển `unknown` (`error_code = lease_expired`, `finish_source = sweeper`) — tự động ở lần `ai_usage_begin` kế tiếp, hoặc nút “Đánh dấu … yêu cầu treo” trên dashboard. Kết quả ghi muộn vẫn sửa được bản ghi `unknown` do sweeper đặt.
- Không có transaction xuyên Postgres–OpenAI: nếu process chết sau khi OpenAI đã xử lý mà trước khi ghi, token của lần đó là “chưa biết”. Dashboard hiển thị số này; không xóa dấu vết.
- Đóng modal / abort trên trình duyệt không chứng minh OpenAI dừng: backend vẫn ghi usage nếu nhận được.

### Idempotency và chống trùng

- **Dedupe log:** `event_id` là khóa chính; ghi attempt là upsert theo `(request_id, attempt_number)`.
- **Idempotency tác vụ AI:** mỗi lô có `requestId` (UUID) do trình duyệt tạo. Khi lỗi mạng, `imageNameService` tự gửi lại **một lần** sau 0,8 s với cùng `requestId`. Khóa theo `(user_id, feature, requestId)` trong `usage_private.ai_idempotency`:
  - cùng khóa, cùng payload, đang chạy → `409 REQUEST_IN_PROGRESS` (+ `retryAfterSeconds`);
  - đã xong và còn bản replay (1 giờ) → trả lại kết quả cũ (`replayed: true`), không gọi OpenAI;
  - kết quả không xác định hoặc hết bản replay → `409 REQUEST_OUTCOME_UNKNOWN` / `REQUEST_ALREADY_PROCESSED`, không tự gọi lại miễn phí;
  - cùng khóa, payload khác → `409 IDEMPOTENCY_CONFLICT`;
  - người dùng khác dùng cùng khóa → request riêng, không đọc được kết quả của nhau.
- So sánh payload bằng HMAC-SHA256 phía server (`AI_USAGE_FINGERPRINT_SECRET`, hoặc khóa dẫn xuất từ `OPENAI_IMAGE_NAME_KEY`); chỉ lưu digest. Digest bao gồm model được chọn (nếu client gửi), prompt, tên sản phẩm và ảnh; đổi model/prompt với cùng request ID bị từ chối conflict. `requested_model` ghi model đã kiểm tra từ lựa chọn người dùng, hoặc fallback từ env cho client cũ. Khóa hết hạn sau 24 giờ.
- Bấm “Tạo lại”/“Thử lại” là thao tác mới → `requestId` mới. Retry tự động trong wrapper OpenAI vẫn là attempt riêng. Không dựa vào header idempotency của provider.

## 4. Giá và chi phí ước tính

Bảng `usage_private.model_prices` theo provider + model + service tier + dải context (`max_input_tokens`), có `effective_from`/`effective_to`, `version`, `source_url`. Giá chỉ **thêm mới** cho thời điểm sau giá hiện tại; mỗi attempt lưu bản sao đơn giá (`price_*`, `price_version`) nên đổi giá không sửa lịch sử.

Công thức (`usage_private.estimate_cost_usd`, `numeric`, chỉ làm tròn khi hiển thị):

```text
regular_input = input_tokens − cached_tokens − cache_write_tokens
estimated_usd = ( regular_input × input
                + cached_tokens × cached_input
                + cache_write_tokens × cache_write
                + output_tokens × output ) / 1 000 000
```

- `reasoning_tokens` là một phần của `output_tokens`, không cộng lần hai. Token ảnh đã nằm trong `input_tokens`.
- Thiếu giá cho loại token có mặt (ví dụ có cache write mà không có giá cache write), model hoặc tier không có giá → `unpriced`: vẫn lưu token, chức năng vẫn chạy.
- Model trả về dạng `gpt-6-luna-YYYY-MM-DD` khớp giá của `gpt-6-luna` khi `match_snapshots = true`; giá khớp đúng tên luôn được ưu tiên. Tier `auto`/`default`/không có → `default`.
- Khi thêm giá có thể chọn “tính giá cho attempt chưa có giá” — chỉ điền attempt `unpriced`, không đổi attempt đã ước tính.
- **Giá có sẵn trong migration** (xác minh ngày 18/10/2026 tại <https://developers.openai.com/api/docs/pricing>): `gpt-6-luna`, USD/1M token — Standard ≤ 272K input: 0,10 / cache 0,01 / cache write 0,125 / output 0,50; > 272K: 0,20 / 0,02 / 0,25 / 0,75; Flex: một nửa Standard. Không gồm phụ phí 10% của data residency. Tier khác (Fast/priority, Batch) chưa có giá → `unpriced`. Hãy kiểm tra lại trước khi đối soát.
- USD là chuẩn. VND chỉ là quy đổi theo tỷ giá admin nhập (kèm ngày), không phải số tiền hóa đơn.
- Dashboard ghi “Chi phí ước tính”, và “đã ghi nhận” khi có attempt chưa biết usage hoặc chưa có giá.

## 5. Quota, giới hạn tần suất và ngân sách

Thay limiter trong bộ nhớ từng isolate bằng kiểm tra trong `ai_usage_begin` (dùng chung mọi instance, không đọc-rồi-ghi). Cấu hình ở `usage_private.settings` (tab “Cấu hình & cảnh báo”). Mặc định giữ đúng giới hạn cũ:

| Giới hạn | Mặc định |
| --- | --- |
| Cửa sổ | 600 s |
| Request / cửa sổ / người | 40 |
| Ảnh / cửa sổ / người | 150 |
| Đồng thời / người, toàn hệ thống | 2, 8 |
| Lease (coi là treo) | 240 s |
| Quota ảnh theo ngày/tháng | **Tắt** (`quota_enforced = false`) |

- Quota theo gói (`plan_quotas`: free/pro/enterprise/admin; trống = không giới hạn) và ngoại lệ từng người (`user_quota_overrides`, có “không giới hạn”) chỉ áp dụng khi admin bật. Admin vẫn được ghi usage đầy đủ.
- Đơn vị quota: **số ảnh đã gửi tới OpenAI**, tính một lần cho mỗi logical request (retry nội bộ và gửi lại cùng `requestId` không tính thêm); token/chi phí vẫn theo từng attempt. Ngày/tháng cắt theo giờ Việt Nam.
- Không hoàn quota: request đã nhận (kể cả lỗi, timeout, `unknown`) vẫn tính vì có thể đã chạm OpenAI. Request bị từ chối trước khi gọi không tính.
- Mã lỗi ổn định: `429 rate_limited`, `429 too_many_concurrent`, `429 AI_QUOTA_EXCEEDED` (kèm `quota: { scope, limit, used }`), `503 AI_USAGE_PAUSED`, có `retryAfterSeconds` + header `Retry-After` khi tính được. Modal giữ nguyên tên/bản nháp.
- **Công tắc dừng** (`ai_enabled`): từ chối yêu cầu mới ở máy chủ; kết quả đã có vẫn replay được.
- **Ngân sách tháng** (`budgets`: toàn ứng dụng, theo key alias, theo người dùng; ngưỡng mặc định 70/90/100%): chỉ là **cảnh báo** trong dashboard trên chi phí ước tính nội bộ — không gửi email/Slack, không phải hard cap. Chế độ chặn theo ngân sách chưa làm vì chưa có cận trên chi phí đáng tin cho mỗi request (token output, retry, usage không xác định).
- Key OpenAI dùng ở dự án khác phát sinh phí ngoài sổ này. Nên dùng key/project riêng theo môi trường và tính năng, đặt spend limit trên OpenAI (đề xuất, không tự tạo/xoay key).
- Mọi thay đổi giới hạn, quota, ngân sách, giá, công tắc đều ghi `usage_private.config_audit` (người thực hiện, thời gian, giá trị trước/sau).

## 6. Bảo mật và quyền truy cập

- Bảng nằm trong schema `usage_private`: không expose qua PostgREST, không cấp USAGE cho `anon`/`authenticated`, RLS bật, EXECUTE mọi hàm private bị thu hồi. Trình duyệt (kể cả admin) không đọc/ghi trực tiếp.
- Wrapper public hẹp, `security definer`, `search_path = ''`:
  - `usage_log_activity` — `anon`, `authenticated`: chỉ ghi sự kiện, `user_id` lấy từ `auth.uid()`.
  - `ai_usage_begin`, `ai_usage_attempt_start`, `ai_usage_attempt_finish`, `ai_usage_finish`, `ai_usage_record_rejection` — **chỉ `service_role`**.
  - `admin_usage_overview`, `admin_usage_activity`, `admin_usage_requests`, `admin_usage_request_detail`, `admin_usage_operation`, `admin_usage_config`, `admin_usage_config_change`, `admin_usage_sweep` — `authenticated`, kiểm tra `public.is_admin()` phía server (quy tắc admin hiện có, không dùng `user_metadata`). `AdminRoute` chỉ là lớp giao diện.
- Không lưu API key, JWT, service key, ảnh/base64, blob URL, prompt, tên file hay tên sản phẩm trong log. Lỗi từ OpenAI chỉ giữ mã đã lọc (`[A-Za-z0-9_.-]{1,64}`), không giữ message. Bản replay (tên gợi ý dạng slug) nằm trong bảng idempotency riêng, giữ 1 giờ.
- `OPENAI_IMAGE_NAME_KEY_ALIAS` là nhãn (ví dụ `image-naming-prod-v1`); nhãn trông như key (`sk-…`, chứa một phần key) bị thay bằng `invalid-alias` và log cảnh báo.
- Không thu IP, user agent hay fingerprint.
- CSV xuất từ dashboard chặn formula injection (ô văn bản bắt đầu bằng `= + - @`, tab, CR được thêm `'`), giới hạn 5.000 dòng và báo khi bị cắt.

## 7. Dashboard `/admin/usage`

Mọi lọc, tổng hợp và phân trang chạy ở server; trình duyệt không tải log thô. Thời gian lưu UTC, hiển thị và chia ngày theo `Asia/Ho_Chi_Minh` (UTC+7, không phụ thuộc giờ máy admin); khoảng `[from, to)`, tối đa 400 ngày. Phân trang con trỏ theo `(thời gian, id)`. Lỗi/thiếu migration hiển thị là lỗi (không thành 0), có “Thử lại”; nút “Làm mới”; không dùng realtime.

| Chỉ số | Nguồn | Định nghĩa |
| --- | --- | --- |
| Ảnh tạo (local) | activity | Tổng `succeeded_count` của `image.create` |
| Thao tác tải | activity | Sự kiện `image.download` có ≥ 1 ảnh đã giao |
| Ảnh đã gửi tải | activity | Tổng ảnh đã giao (anchor hoặc đã ghi file) |
| Người dùng đăng nhập / Visitor | activity | Đếm riêng `user_id` và `visitor_id`; không cộng thành “số người” |
| Áp dụng tên AI | activity | Tổng tên đã áp dụng; số lần bấm |
| Lượt chạy, request, attempt | ledger | Xem mục 3; request không gồm bị từ chối (đếm riêng) |
| Token, chi phí ước tính | ledger — **chỉ tầng attempt** | Không cộng request với attempt |
| Attempt chưa biết usage / chưa có giá | ledger | `usage_status` ∈ {unknown, missing}; `cost_status = unpriced` |
| Tỷ lệ retry | ledger | Request có > 1 attempt / request đã gọi provider |
| Tỷ lệ tên AI áp dụng nguyên văn | ledger + activity | Theo **cohort** lượt chạy có request đầu tiên trong kỳ, theo tới khi áp dụng: tên giữ nguyên / gợi ý thành công. Không chia số áp dụng hôm nay cho số request hôm nay |
| Bộ đếm cũ | `watermark_image_counts` | Hiển thị tham chiếu, **không cộng** với số mới |

Tab: **Tổng quan** (thẻ số, biểu đồ theo ngày cho chi phí/token/request/ảnh, top 10 người dùng theo chi phí, lỗi theo request/attempt, ngân sách, sức khỏe dữ liệu), **Nhật ký hoạt động** (lọc thao tác, chi tiết operation/batch/run), **Sử dụng AI** (tra cứu theo request ID máy chủ, `requestId` trình duyệt, `x-request-id`, response ID hoặc run ID; chi tiết từng attempt), **Cấu hình & cảnh báo**.

Trong **Cấu hình & cảnh báo → Model AI theo gói**, admin tích chọn model cho Free/Pro/Enterprise/Quản trị viên rồi lưu từng dòng. Bỏ chọn tất cả sẽ tắt Đặt tên AI cho gói; mỗi gói dùng đúng danh sách riêng. Hành động `plan_models.update` ghi nhật ký trước/sau. `usage_private.plan_models` bật RLS và không cấp truy cập bảng trực tiếp; public RPC là `security invoker`, gọi các hàm private kiểm tra admin. `ai_naming_models()` chỉ trả quyền của chính JWT gọi. Watermark lọc dropdown theo quyền, Edge Function kiểm tra lại trước mỗi lần gọi OpenAI.

### Truy vết một yêu cầu

Response của Edge Function luôn có `requestId` (ID máy chủ); request gửi đi có `requestId` của trình duyệt. Dán một trong hai (hoặc `x-request-id` của OpenAI) vào ô tra cứu ở tab “Sử dụng AI”. Log Edge Function ghi `requestId` máy chủ khi ghi sổ lỗi. Không cần và không được log nội dung.

## 8. Nguồn dữ liệu cũ/mới và thời điểm bắt đầu

- `watermark_image_counts` (bộ đếm công khai trên `/watermark`, trang `/admin/watermark`) **giữ nguyên** và vẫn được ghi mỗi lần tạo ảnh. Nó là nguồn duy nhất của bộ đếm công khai; `/admin/usage` dùng nhật ký mới. Không có chỉ số nào cộng hai nguồn.
- Nhật ký tải ảnh, sự kiện áp dụng tên, request/attempt/token/chi phí chỉ có **từ lúc áp dụng migration và deploy** (`settings.tracking_started_at`, hiển thị ở “Sức khỏe dữ liệu”). Không dựng lại lịch sử. Cột `legacy` có sẵn nếu sau này nhập số đếm ảnh cũ; khi đó chỉ nhập số ảnh, không tạo request/attempt/token.

## 9. Lưu giữ và xóa dữ liệu

- **Đề xuất vận hành** (không phải yêu cầu pháp lý): giữ log thô 90 ngày, số tổng hợp theo ngày 12 tháng. **Chưa triển khai job xóa/tổng hợp** — chưa có dữ liệu nào bị xóa tự động. Khi làm: tổng hợp trước theo ngày (giờ VN) với checkpoint, chạy lại không đếm đôi, dashboard đọc rollup cho ngày ≤ checkpoint và log thô cho ngày sau (không chồng thời gian); chạy thử trên staging, không bật job xóa trên production khi chưa duyệt.
- Đã có dọn dẹp tự động không ảnh hưởng thống kê: khóa idempotency hết hạn (24 giờ), bản replay (1 giờ), request treo → `unknown`.
- Xóa tài khoản: `user_id` → NULL (`on delete set null`), tổng usage giữ nguyên, không có email/tên snapshot nào trong sổ (tên đọc trực tiếp từ `profiles`). Khóa idempotency, quota riêng của người đó bị xóa theo. Lịch sử khách không được nối vào tài khoản khi đăng nhập.

## 10. Triển khai

Không tự deploy production trong nhiệm vụ này. Thứ tự đề xuất:

1. **Kiểm tra trước:** đã có `supabase_admin_profiles_policies.sql` (`is_admin()`), `20261017090000_profiles_plan_check.sql`, `20261017100000_ai_naming_access.sql`.
2. **Migration** (staging trước): `npx supabase db push`, hoặc chạy lần lượt trong SQL Editor:
   - `supabase/migrations/20261018090000_usage_ledger.sql`
   - `supabase/migrations/20261018091000_usage_admin.sql`
   - `supabase/migrations/20261019045632_ai_naming_plan_models.sql`

   Cả ba chạy lại được. Migration model giữ quyền mặc định trước đây (Free chưa được dùng; Pro/Enterprise/admin có ba model). Sau khi cấu hình, quyền mới cũng áp dụng qua `can_use_ai_naming()` cho client cũ; để kiểm tra từng model, cần deploy function mới và frontend.
3. **Secret/biến cho Edge Function** (chỉ tên, đặt bằng `npx supabase secrets set …`):
   - `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` hoặc `SUPABASE_SERVICE_ROLE_KEY`: Supabase tự cung cấp cho function hosted. Secret key mới (`sb_secret_…`) được gửi trong header `apikey`; service role JWT cũ gửi thêm `Authorization`.
   - `OPENAI_IMAGE_NAME_KEY_ALIAS` (khuyên dùng, ví dụ `image-naming-prod-v1`), `AI_USAGE_ENVIRONMENT` (`production`/`staging`/`local`), `AI_USAGE_FINGERPRINT_SECRET` (tùy chọn, chuỗi ngẫu nhiên dài). Thiếu alias → `unlabeled`; thiếu environment → `unknown`.
4. **Deploy function:** `npx supabase functions deploy suggest-image-names` (giữ verify JWT). Từ bản này, nếu sổ không ghi được (migration chưa áp dụng, thiếu server key) function trả `503 usage_tracking_unavailable` và không gọi OpenAI — vì vậy migration phải có trước.
5. **Frontend:** build/deploy như cũ, không có biến mới. Telemetry tự tắt trong phiên nếu RPC chưa có.
6. **Bật theo giai đoạn:** (A) migration → function → frontend, theo dõi “Sức khỏe dữ liệu” vài ngày; đặt tỷ giá, ngân sách. (B) khi đã có số liệu thật, đặt quota theo gói rồi bật “Áp dụng hạn mức ảnh”.
7. **Rollback an toàn:** tắt AI bằng công tắc nếu cần dừng chi phí ngay; quay lại function bản trước (`git checkout <commit> -- supabase/functions/suggest-image-names && npx supabase functions deploy suggest-image-names`) — bản cũ không dùng sổ, giới hạn lại về bộ nhớ từng isolate; frontend bản cũ bỏ qua telemetry. Giữ nguyên schema `usage_private` (không xóa dữ liệu); nếu bắt buộc gỡ, chỉ `revoke`/`drop function` các wrapper public, không `drop schema` khi chưa sao lưu.

### Smoke test local/staging (chưa chạy trong nhiệm vụ này)

- [ ] Admin mở `/admin/usage`: thấy “Bắt đầu theo dõi”, không có lỗi migration.
- [ ] Tài khoản Pro tạo 3–5 ảnh, tải 1 ảnh, tải ZIP (Chrome: chọn thư mục rồi hủy một lần, ghi một lần), tải 800×600 → nhật ký hoạt động đúng thao tác, số ảnh, “Đã gửi tới trình duyệt”/“Đã ghi file”.
- [ ] Đặt tên AI 7 ảnh → 1 run, 2 request; attempt có `x-request-id`, model thực tế, token, chi phí ước tính khớp `usage` trong log OpenAI.
- [ ] Áp dụng tên → 1 sự kiện áp dụng, không có request mới; mở lại bản nháp → không có request mới.
- [ ] Tài khoản Free gọi thẳng endpoint → 403, có bản ghi từ chối, không attempt.
- [ ] Tắt AI → 503 `AI_USAGE_PAUSED`; bật lại → hoạt động.
- [ ] Gọi `rest/v1/rpc/ai_usage_begin` bằng JWT người dùng/admin → bị từ chối; `select` bảng `usage_private.*` qua REST → không truy cập được.
- [ ] Hai tab cùng chạy đặt tên AI → không vượt 2 request đồng thời/người.
- [ ] CORS từ domain production; log function không chứa key, ảnh, prompt.
- [ ] Đối chiếu token/chi phí một ngày với trang Usage của OpenAI (sai lệch do múi giờ, key dùng chung, attempt chưa biết usage).

## 11. Kiểm thử

| Lệnh | Nội dung |
| --- | --- |
| `npm run test:usage` | `tests/usageLedgerDatabase.test.mjs` (PGlite: quyền/grants/RLS theo vai trò Supabase, `search_path`, ingestion, dedupe đồng thời, chủ thể, allowlist, giới hạn, ngữ nghĩa tải, ranh giới ngày VN quanh 17:00 UTC, phân trang con trỏ, tổng hợp dashboard, ngân sách, audit, xóa tài khoản, EXPLAIN trên 180 nghìn dòng); `tests/usageLedgerFunction.test.mjs` (handler + SQL thật: 13 ảnh 6+6+1 có retry, usage khi output hỏng, timeout → unknown, không retry lỗi auth/quota, idempotency đồng thời giữa 2 instance, conflict, user khác, sổ lỗi trước/sau khi gọi, lease hết hạn, giới hạn dùng chung, quota, công tắc, từ chối, không lộ bí mật, alias, giá/đổi giá/backfill); `tests/usageTelemetry.test.mjs` (event, runner tải, hàng đợi: retry cùng ID, TTL, giới hạn, đổi tài khoản, lưu trữ, rate limit); `tests/adminUsageUI.test.mjs` (dashboard jsdom: nhãn, lỗi không thành 0, lọc server, con trỏ, CSV chống công thức, chi tiết attempt) |
| `npm run test:ai-image-names` | Bộ cũ, cập nhật cho ledger (ledger giả lập), gửi lại cùng `requestId`, thống kê áp dụng, callback tải từng ảnh |

PGlite/mock không thay cho Supabase Auth, PostgREST và Edge Runtime thật; PGlite chạy một kết nối nên “đồng thời” được tuần tự hóa — trên Postgres thật, advisory lock trong `ai_usage_begin` bảo đảm điều tương tự nhưng cần smoke test ở trên. Giao diện chưa được kiểm tra bằng trình duyệt thật (kể cả 390px).

## 12. Checklist nghiệm thu

**Giai đoạn A**

- [x] Sự kiện tạo/tải/áp dụng với schema ổn định, ID chống trùng, chủ thể chốt lúc bắt đầu, best effort.
- [x] Ngữ nghĩa tải trung thực (anchor vs ghi file, hủy picker, ZIP chưa phát hành, lỗi theo giai đoạn).
- [x] Sổ request + attempt từ backend; usage đọc trước khi parse; ghi mọi attempt; unknown ≠ 0.
- [x] Không gọi OpenAI khi không ghi được bản ghi bắt đầu; lỗi ghi sau khi gọi không gây gọi lại; request treo → unknown.
- [x] Idempotency theo user + feature, conflict khi khác payload, không replay chéo người dùng.
- [x] Bảng giá có version và snapshot; cached/cache write/reasoning đúng; thiếu giá → unpriced.
- [x] Schema private, wrapper hẹp, kiểm tra admin phía server, CSV an toàn, không lưu bí mật/nội dung.
- [x] Dashboard `/admin/usage` trong menu quản trị, tiếng Việt, theo theme hiện có, lọc/phân trang ở server.
- [ ] Smoke test trên Supabase thật và kiểm tra giao diện bằng trình duyệt (390px) — chưa chạy.

**Giai đoạn B**

- [x] Giới hạn tần suất/đồng thời dùng chung qua DB, atomic, lease có TTL; giữ mặc định cũ.
- [x] Quota ảnh theo ngày/tháng theo gói + ngoại lệ, mặc định tắt; không hoàn quota sai.
- [x] Mã lỗi ổn định + `retryAfterSeconds`; frontend giữ bản nháp.
- [x] Ngân sách tháng (app/key/user) với cảnh báo 70/90/100% trong dashboard; công tắc dừng; audit.
- [x] Theo dõi request treo, usage thiếu, chưa có giá, thời điểm dữ liệu bắt đầu.
- [ ] Job tổng hợp + xóa log thô theo retention — mới là đề xuất (mục 9).

## 13. Backlog giai đoạn C (đề xuất, chưa làm)

1. **Đồng bộ OpenAI Usage/Costs API** — đối soát chi phí thật theo ngày/project/API key. Cần admin key của organization (secret riêng trên server), sync idempotent theo ngày với watermark, xử lý pagination, độ trễ dữ liệu và chênh lệch múi giờ (OpenAI theo UTC). Bật khi có quyền và key/project riêng cho ứng dụng. Thiếu quyền thì dashboard vẫn dùng ước tính nội bộ.
2. **Tách số tiền provider và chi phí quy cho người dùng** — phần chênh lệch hóa đơn không phân bổ tùy tiện; chỉ phân bổ theo ledger nội bộ.
3. **Trang “Mức sử dụng của tôi”** — RPC chỉ đọc số của chính `auth.uid()` và quota còn lại, không lộ key/cấu hình hay người khác. Bật khi quota được áp dụng.
4. **Cache gợi ý** theo nhận diện ảnh + người dùng, có TTL và invalidation; ghi `cache_hit` không tạo attempt/token. Cần cách nhận diện ảnh đáng tin và đánh giá bảo vệ dữ liệu trước.
5. **Cảnh báo bất thường và circuit breaker** — phát hiện tăng đột biến theo người dùng/key; tạm ngắt khi lỗi provider kéo dài, có chính sách minh bạch và tự phục hồi. Kênh email/Slack là tích hợp ngoài, cần secret riêng.
6. **Mở rộng taxonomy** cho AI sinh tên sản phẩm hoặc sinh ảnh khi có các luồng đó: `feature` mới, đơn vị tính phí theo provider (ảnh, giây…), không gộp với watermark local.
7. **Chặn theo ngân sách** — chỉ khi có cận trên chi phí đáng tin cho mỗi request (giới hạn `max_output_tokens`, số attempt, cận trên input theo số ảnh), reserve atomically, xử lý usage không xác định và công bố sai số.
