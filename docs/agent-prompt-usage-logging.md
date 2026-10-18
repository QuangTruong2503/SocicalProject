# Prompt triển khai nhật ký sử dụng và theo dõi chi phí API

Ngày nghiên cứu: 17/10/2026. Có thể gửi toàn bộ phần từ “Bắt đầu prompt” đến “Kết thúc prompt” cho agent có quyền đọc/sửa repository này.

## Ghi nhận từ repository

- Stack: React 19, Vite 8, Supabase Auth/Postgres/Edge Functions; bộ kiểm thử dùng Node test runner, jsdom và PGlite.
- “Tạo ảnh” hiện là xử lý watermark trên thiết bị, không phải AI sinh ảnh. `src/pages/Watermark.jsx` thực hiện tạo ảnh và tải hàng loạt; tải từng ảnh nằm trong `ResultCard` của `src/components/watermark/WatermarkGallery.jsx`.
- Đã có bảng `watermark_image_counts`, service `src/services/watermarkImageCountService.js`, các SQL `supabase_watermark_image_counts.sql`, `supabase_watermark_stats_rpc.sql`, và trang `src/pages/Admin/AdminWatermarkPage.jsx`. Bộ đếm hiện ghi số ảnh tạo thành công theo lô, có khách vãng lai, chưa phải sổ chi phí đáng tin cậy.
- Tính năng AI hiện nhận tên sản phẩm người dùng nhập rồi gợi ý mô tả/tên file cho từng ảnh; chưa phải chức năng tự tạo tên thương mại sản phẩm từ đầu. Frontend nằm trong `AiRenameModal.jsx`, `src/services/imageNameService.js`; backend là `supabase/functions/suggest-image-names/{handler.js,openai.js,imageNaming.js,index.ts}`.
- AI chia tối đa 6 ảnh/request, frontend chạy 2 request đồng thời; OpenAI wrapper có tối đa 3 attempt/request. Handler kiểm tra quyền bằng JWT và RPC `can_use_ai_naming()`. Quyền hiện gồm admin hoặc tài khoản không khóa có gói từ Pro; phải đọc migration để giữ nguyên quy tắc chính xác.
- OpenAI wrapper trả JSON nhưng handler chỉ dùng phần kết quả đặt tên; chưa lưu bền vững usage, request ID, từng attempt và chi phí. Limiter hiện là dữ liệu trong bộ nhớ handler, không đồng bộ giữa các instance.
- Tài liệu hiện có: `docs/ai-image-naming.md`. Thông tin trên là kết quả đọc mã nguồn, chưa xác minh trạng thái database/function production.

## Bắt đầu prompt

Bạn là kỹ sư full-stack triển khai trực tiếp tính năng cho repository đang mở. Hãy đọc mã nguồn, lập kế hoạch ngắn rồi thực hiện các yêu cầu bắt buộc bên dưới, kèm migration, giao diện, kiểm thử và tài liệu. Không chỉ đưa ra đề xuất.

### 1. Mục tiêu và phạm vi

Xây dựng hệ thống trả lời được:

1. Ai tạo bao nhiêu ảnh, tải bao nhiêu ảnh, dùng đặt tên AI bao nhiêu lần, vào lúc nào?
2. Mỗi người dùng, model, môi trường và API key logic phát sinh bao nhiêu request, attempt, token và chi phí ước tính?
3. Lỗi, retry, yêu cầu bị từ chối, hoặc đã tốn token nhưng kết quả không sử dụng được xảy ra ở đâu?
4. Có sử dụng bất thường, vượt quota hoặc sắp vượt ngân sách không?

Hiểu đúng nghiệp vụ hiện tại: tạo ảnh watermark và tải file là thao tác local; đặt tên AI là gọi dịch vụ tính phí. Trong giao diện ghi rõ “Đặt tên ảnh bằng AI”. Nếu phát hiện một luồng tự sinh tên sản phẩm riêng trong mã mới, tích hợp thêm bằng feature riêng. Không tự bổ sung AI sinh ảnh hoặc thay đổi cách đặt tên chỉ để đáp ứng việc ghi log.

Thực hiện giai đoạn A và B. Giai đoạn C là mở rộng, ghi đề xuất và điểm tích hợp, không mặc định triển khai các hạ tầng/tích hợp ngoài dự án.

### 2. Đọc và giữ tương thích

Đọc `AGENTS.md` nếu có, các file được liệt kê ở phần ghi nhận repository phía trên, `src/App.jsx`, `src/pages/Admin/AdminLayout.jsx`, các service helper, cơ chế `is_admin()`, Auth và migration hiện có. Kiểm tra lại tên file/luồng nếu repository đã thay đổi.

- Giữ nguyên xử lý ảnh local, tên file, ZIP, resize, tiến trình, hủy tác vụ, khôi phục bản nháp AI, phân quyền và thống kê watermark hiện có.
- Không bỏ bộ đếm cũ hoặc cộng cả log mới và cũ vào cùng một chỉ số gây đếm đôi. Chọn rõ một nguồn dữ liệu cho từng chỉ số.
- Không suy diễn lịch sử: log tải ảnh/token/chi phí chỉ có từ lúc bật tính năng. Nếu nhập dữ liệu đếm ảnh cũ, đánh dấu `legacy`, không dựng lại request/attempt hay token không tồn tại.
- Không đổi model đang cấu hình và không hardcode giá model từ trí nhớ. Xác minh tài liệu chính thức trước khi dùng API/schema/config mới.
- Không đọc/in giá trị bí mật trong `.env`; chỉ xem tên biến mẫu. Không commit bí mật hoặc tự triển khai lên production trong nhiệm vụ này.

### 3. Giai đoạn A — nhật ký hoạt động và sổ API usage (bắt buộc)

#### 3.1. Hai loại dữ liệu có mức tin cậy khác nhau

Tách rõ:

- **Activity telemetry:** thao tác local được trình duyệt báo cáo, có thể thiếu hoặc bị giả mạo. Dùng phân tích sản phẩm; không dùng làm chứng cứ thanh toán/quota API. Khách có visitor ID ngẫu nhiên, không coi visitor ID là danh tính xác thực hay một con người duy nhất.
- **API usage ledger:** server ghi từ xác thực, cấu hình backend và phản hồi nhà cung cấp. Chỉ backend được ghi token, model thực tế, API key logic và chi phí. Frontend không được tự gửi các giá trị này để ghi sổ.

Không lấy số lần bấm nút, số ảnh tạo hoặc số ảnh tải để quy đổi thành token OpenAI. Chi phí vận hành Supabase cũng không thể suy ra chính xác từ các số đếm này; nếu hiển thị phải là chỉ số/ước tính riêng.

#### 3.2. Sự kiện local

Thiết kế một schema sự kiện ổn định, ví dụ `image.create`, `image.download`, `ai.naming.apply`. Với tác vụ có tiến trình, dùng một operation và các transition hoặc một bản ghi tổng kết; không cộng các transition như nhiều lần sử dụng.

Trường cần thiết:

- `event_id` UUID chống gửi trùng; `operation_id`; `image_batch_id` UUID để liên kết ảnh được tạo, tải và đặt tên; có `ai_run_id` khi phù hợp.
- `user_id` do JWT/session phía server xác định; khách dùng null và `visitor_id`. Chốt chủ thể lúc bắt đầu, không gán tác vụ cũ cho tài khoản vừa đăng nhập/đăng xuất giữa chừng.
- `feature`, `action`, `source_page`, `status` với bộ giá trị được kiểm tra.
- `requested_count`, `succeeded_count`, `failed_count`, `skipped_count`, `cancelled_count` khi đo được; định nghĩa rõ để không nhập nhằng ảnh chưa chạy và ảnh lỗi.
- `duration_ms`, `error_code` an toàn, phương thức tải `single/direct/zip`, kích thước `original/800x600` theo luồng thực tế, số file đầu ra và số ảnh trong file.
- `occurred_at` từ client chỉ để tham khảo, `received_at`/thời gian chuẩn từ server; `schema_version`, `app_version` nếu có.
- Metadata theo allowlist, giới hạn kích thước; không nhận JSON tùy ý không giới hạn.

Điểm tích hợp:

1. `handleCreate`: ghi đúng ảnh đã render xong, lỗi từng ảnh, hủy một phần và lỗi toàn bộ. Gán batch ID bền trong vòng đời bộ ảnh; `res-1` hiện tại không phải ID toàn cục.
2. `downloadAll`: cả resize, tải trực tiếp và ZIP; ghi riêng số ảnh đã chuẩn bị và số ảnh thực sự gửi tới cơ chế tải.
3. `ResultCard.handleDownload`: bắt buộc bao phủ tải từng ảnh, dùng callback/service chung để tránh bỏ sót.
4. Áp dụng tên AI: chỉ là sự kiện người dùng dùng kết quả, không tạo thêm lượt gọi API/token. Mở lại bản nháp không được ghi là gọi AI mới.

Ý nghĩa tải xuống phải trung thực:

- Với anchor/blob download, trình duyệt chỉ cho biết ứng dụng đã kích hoạt tải; dùng trạng thái/nhãn “Đã gửi tới trình duyệt”, không khẳng định đã lưu thành công trên ổ đĩa.
- Với File System Access API, chỉ ghi “Đã ghi file” sau khi stream và close thành công.
- ZIP chứa 20 ảnh = 1 thao tác tải, 1 file ZIP, 20 ảnh; không phải 20 request API.
- Hủy hộp thoại chọn vị trí lưu không được tính là tải thành công. ZIP đã thêm ảnh nhưng chưa phát hành file không được tính các ảnh đó là đã tải.
- Tải lại cùng ảnh do người dùng chủ động là một thao tác mới; retry gửi telemetry của cùng thao tác dùng lại event ID và không tăng số đếm.

Ghi log local theo best effort, không chặn người dùng tạo/tải ảnh. Nếu có hàng đợi retry, giới hạn kích thước, TTL, số lần thử và thời gian chờ; không lưu nội dung ảnh. Không gửi telemetry tồn đọng của user A dưới danh tính user B sau khi đổi tài khoản. Tài liệu nêu rõ mất mạng/đóng tab/ad blocker có thể làm thiếu log; không hứa đảm bảo giao nhận tuyệt đối.

#### 3.3. Cấu trúc dữ liệu server đề xuất

Có thể đổi tên/ghép bảng nếu hợp lý, nhưng giữ đủ ba tầng và tránh đếm chồng:

1. `usage_activity_events`: log thao tác local đã chuẩn hóa.
2. `ai_usage_requests`: mỗi batch được backend chấp nhận là một logical request, có `request_id`, `ai_run_id`, user, feature, thời gian, kết quả nghiệp vụ và tổng usage được biết.
3. `ai_usage_attempts`: mỗi lần thực sự thử gọi OpenAI là một attempt, liên kết logical request; unique `(request_id, attempt_number)`.

Thông tin request/attempt cần có:

- Request ID của ứng dụng, provider response ID và `x-request-id` khi nhận được; không nhầm các loại ID.
- `provider`, `endpoint` logic, `feature`, `environment`, `requested_model`, `resolved_model` từ response khi có, `key_alias` và phiên bản key do backend cấu hình, ví dụ `image-naming-prod-v1`. Alias không chứa bí mật, không phải API key value.
- `images_requested`, `images_succeeded`, `images_failed`, `needs_review_count`; phân biệt kết quả HTTP/provider với kết quả đặt tên ứng dụng.
- `attempt_number`, HTTP status nếu có, mã lỗi chuẩn hóa, thời gian bắt đầu/kết thúc/latency, lý do retry, trạng thái đang chạy/thành công/lỗi/không xác định.
- `input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_tokens`, `total_tokens` từ usage response nếu có. Lưu breakdown bổ sung đã kiểm tra theo schema hiện hành nếu cần; không lưu toàn bộ response chứa nội dung.
- `usage_status` ví dụ `reported/unknown/not_called`, trạng thái chi phí `estimated/unknown/not_applicable`, `estimated_cost_usd`, phiên bản giá và đơn giá snapshot.

Không có usage thì để null/unknown, không điền 0 để làm dashboard trông đầy đủ. Tác vụ chắc chắn chưa gọi provider có thể đánh dấu `not_called`; khác với timeout đã gửi request nhưng không biết nhà cung cấp xử lý tới đâu.

Ràng buộc/index: UUID và FK phù hợp; count/token không âm; cached không vượt input khi có số liệu đầy đủ; unique keys chống trùng; index cho khoảng thời gian, `(user_id, created_at)`, `(key_alias, created_at)`, feature/model khi thực sự dùng trong truy vấn. Không tạo index hàng loạt không có nhu cầu. Timestamps lưu `timestamptz`.

#### 3.4. Instrument backend đúng chỗ

- Giữ xác thực JWT và kiểm tra `can_use_ai_naming()` mỗi request trước khi gọi OpenAI; không nhận user/role/plan/key alias từ body làm nguồn tin cậy.
- Tạo request ledger sau khi đã xác thực và kiểm tra dữ liệu; ghi rõ các từ chối quyền/quota/validation theo chính sách riêng, không giả tạo provider attempt. Từ chối trước gateway có thể chỉ thấy trong platform logs, không hứa handler ghi được mọi 401.
- Bao từng attempt trong `openai.js`, lấy usage và header ngay sau response, trước `parseOpenAIOutput()`/ghép tên. JSON không hợp lệ, refusal, incomplete hay không khớp ID vẫn có thể đã tốn token.
- Ghi cả attempt lỗi và các attempt trước khi retry. Không chỉ ghi lần cuối. Callback/hook theo attempt có thể dùng để giữ code dễ kiểm thử.
- HTTP 200 với toàn bộ ảnh lỗi là thất bại nghiệp vụ, không phải đặt tên thành công. `needsReview` là chỉ số riêng, không tự quy thành API lỗi.
- Đóng modal, abort phía browser hay mất kết nối không chứng minh provider ngừng xử lý. Nếu backend nhận được usage vẫn phải lưu; nếu không biết, đánh dấu unknown.
- Ghi bản ghi bắt đầu trước khi gọi dịch vụ tính phí. Nếu không thể ghi bền vững bản ghi bắt đầu, trả lỗi dịch vụ theo dõi tạm thời và không gọi OpenAI. Telemetry local vẫn best effort.
- Nếu provider đã chạy nhưng ghi kết quả thất bại: retry ghi log có giới hạn theo ID cố định, phát operational log an toàn; không gọi OpenAI lại chỉ để khôi phục log. Giữ request pending/unknown để phát hiện và xử lý sau, không báo usage bằng 0. Nêu giới hạn khi process bị kill giữa hai hệ thống vì không có transaction xuyên Postgres/OpenAI.
- Có cơ chế đánh dấu request treo quá timeout thành trạng thái không xác định và hiển thị số lượng thiếu usage. Không xóa dấu vết để bảng số đẹp hơn.

#### 3.5. Chống ghi trùng và gọi API trùng

Phân biệt hai việc:

- Dedupe log: gửi lại cùng event hoặc retry ghi ledger không tạo thêm hàng/chi phí.
- Idempotency tác vụ AI: frontend cung cấp operation/batch request ID ổn định khi gửi lại do mất mạng; backend scope theo user + feature, khóa/claim bằng transaction hoặc unique constraint để hai instance không gọi cùng tác vụ đồng thời.

Nếu cùng key nhưng payload khác, từ chối conflict. Nếu so sánh payload, dùng HMAC/hash phía server với thiết kế bảo mật phù hợp, không lưu raw ảnh/prompt. Quy định TTL và vòng đời idempotency. Có thể cần kết quả đã chuẩn hóa tối thiểu để replay: tách khỏi bảng log, giới hạn quyền và retention ngắn; nếu không replay được thì trả trạng thái rõ ràng thay vì tự gọi lại. Không coi header idempotency tự đặt là bảo đảm provider hỗ trợ. Unknown sau timeout không được tự coi như chưa chạy để retry miễn phí.

Nút người dùng chủ động “tạo lại” dùng request ID mới. Retry HTTP của cùng thao tác dùng request ID cũ. Các attempt tự động bên trong wrapper vẫn được ghi riêng vì đó là các lần có thể chạm provider.

#### 3.6. Đơn giá và chi phí

Tạo cấu hình giá có version/thời điểm hiệu lực theo provider + model + service tier/billing mode nếu áp dụng. Giữ snapshot đơn giá của từng attempt để đổi giá sau này không sửa lịch sử. Admin chỉ sửa qua backend có phân quyền, có audit.

Với model tính giá theo input/cached-input/output, công thức cơ bản:

```text
uncached_input = input_tokens - cached_input_tokens
estimated_usd = (
  uncached_input * input_price_per_million
  + cached_input_tokens * cached_input_price_per_million
  + output_tokens * output_price_per_million
) / 1_000_000
```

Chỉ dùng khi usage và bảng giá có đủ dữ kiện; kiểm tra thêm loại token/cache-write/service tier nếu model hiện tại áp dụng. Reasoning tokens thường là breakdown của output, không cộng lại lần thứ hai; token ảnh đã nằm trong usage input không được tính thêm theo số ảnh nếu không có hạng mục phí riêng được xác minh.

- Dùng decimal/numeric hoặc đơn vị tiền nguyên với độ chính xác được chọn rõ; tránh cộng float và làm tròn sớm từng request. Chỉ làm tròn khi trình bày.
- Không có bảng giá khớp model: vẫn ghi token, chi phí unknown; không mặc định bằng 0 và không ngắt chức năng chỉ vì thiếu giá.
- Tổng request = tổng attempt đã biết; dashboard tính từ một tầng để tránh cộng request tổng và attempt chi tiết cùng lúc.
- Hiển thị “Chi phí ước tính”, số attempt chưa biết usage và số chưa có giá. Nếu tổng chỉ có một phần, nhãn phải thể hiện đây là tổng đã ghi nhận.
- USD là giá trị chuẩn. VND là tùy chọn từ tỷ giá cấu hình kèm thời điểm; không khẳng định đó là số tiền thực thu/hóa đơn.

#### 3.7. Bảo mật và quyền truy cập

- Không lưu API key thật, Authorization/JWT, service-role key, ảnh/base64, blob URL, prompt đầy đủ, tên file/tên sản phẩm đầy đủ vào usage logs. Chỉ metadata allowlist cần thiết. Error body từ provider phải được làm sạch.
- Key OpenAI chỉ ở Edge Function secrets, không ở biến `VITE_*`. Key alias có thể lưu nhưng không tiết lộ một phần secret làm định danh.
- Bảng ledger ưu tiên schema private; nếu nằm schema exposed phải có RLS và grants chặt chẽ. Browser kể cả admin không được tự insert/update token/cost/attempt. Backend ghi bằng quyền máy chủ.
- Ingestion activity local có giới hạn payload/count/tần suất, xác thực đối với user, hỗ trợ khách riêng. Visitor ID không phải khóa chống lạm dụng. Không mở quyền để khách ghi ledger AI.
- Chỉ admin đã kiểm tra phía server đọc thống kê toàn hệ thống, log chi tiết, export và thay đổi cấu hình. Tái sử dụng quy tắc admin hiện có; không tự coi `user_metadata` là quyền.
- RPC/view phải được kiểm tra quyền thực tế; nếu cần `SECURITY DEFINER`, đặt implementation ở schema private, cố định `search_path`, revoke execute mặc định và tạo wrapper public hẹp có kiểm tra quyền. Không chỉ bảo vệ bằng `AdminRoute`.
- Log bị từ chối xác thực không được gán vào user ID do client khai. Không thu thập IP/raw user agent/fingerprint chỉ để đủ cột. Nếu chống lạm dụng thật sự cần IP, thiết kế riêng với proxy đáng tin cậy, retention ngắn và bảo vệ dữ liệu.
- Đảm bảo export CSV chống formula injection và không chứa bí mật.

### 4. Dashboard quản trị (bắt buộc trong giai đoạn A)

Thêm `/admin/usage` hoặc một khu vực tương đương nhất quán với AdminLayout, có các tab:

1. **Tổng quan:** ảnh tạo local, thao tác tải, ảnh đã gửi tải, người dùng đăng nhập hoạt động, visitor riêng biệt; số AI run, logical request, provider attempt, ảnh gợi ý thành công/lỗi, token, chi phí đã ước tính, số usage unknown.
2. **Nhật ký hoạt động:** thời gian, người dùng/khách, thao tác, nguồn, số lượng, trạng thái, phương thức tải; mở chi tiết operation/batch.
3. **Sử dụng AI:** request, attempt, user, model, key alias/version, môi trường, usage, latency, lỗi/retry và estimated cost; mở chi tiết xem từng attempt.

Bộ lọc: hôm nay/7/30/90 ngày/khoảng tùy chọn; user; feature; trạng thái; model; key alias; môi trường; tra cứu request ID. Thời gian lưu UTC nhưng hiển thị và chia ngày mặc định `Asia/Ho_Chi_Minh`; sử dụng khoảng `[from, to)` và kiểm thử ranh giới ngày. Không dùng múi giờ máy admin để chia ngày âm thầm.

Biểu đồ theo ngày: usage/cost; top user theo chi phí; tỷ lệ lỗi/retry và tỷ lệ gợi ý được áp dụng nếu có đầy đủ cohort. Không dùng số người “apply hôm nay” chia số request “hôm nay” rồi gọi đó là tỷ lệ chuyển đổi chính xác. Phân biệt user đăng nhập và visitor; không cộng chúng thành số người duy nhất.

Tất cả lọc/tổng hợp/phân trang ở server; không tải toàn bộ raw log về browser. Có loading, empty, error, retry, missing migration/config; không hiển thị lỗi thành 0. Cursor pagination hoặc pagination ổn định theo `(created_at, id)`. Export CSV theo bộ lọc có giới hạn, báo khi bị giới hạn. Có nút refresh; không tạo realtime subscription cho từng raw log nếu không cần.

### 5. Giai đoạn B — kiểm soát sử dụng và vận hành (bắt buộc)

#### 5.1. Quota và rate limit bền vững

Nâng limiter đang ở bộ nhớ thành cơ chế dùng chung qua database hoặc hạ tầng đã có, không cần mua dịch vụ mới:

- Giới hạn request/ảnh theo user và cửa sổ thời gian; concurrency theo user/toàn hệ thống; quota ảnh AI theo ngày/tháng có cấu hình theo plan và override từng user khi cần.
- Không mặc định quota cứng mới cho production khi chưa có cấu hình; giữ giới hạn an toàn hiện tại và cho phép bật chính sách mới rõ ràng. Admin có thể có quota override riêng nhưng vẫn được ghi usage.
- Kiểm tra/cấp chỗ atomically trước gọi provider; các request đồng thời qua nhiều instance không được cùng vượt giới hạn do read-then-write.
- Dùng reservation/lease có TTL, release/reconcile khi thành công/lỗi/unknown; không treo slot mãi khi process chết. Quota đơn vị ảnh: định nghĩa ảnh đã gửi provider là đơn vị tiêu thụ, retry cùng logical request không đếm ảnh business hai lần; attempt/token/cost vẫn tăng theo thực tế.
- Không hoàn quota như chắc chắn chưa chạy nếu attempt timeout sau khi đã gửi provider. Tách ảnh được phép gửi với chi phí upstream thực tế.
- Trả mã lỗi quota/rate limit ổn định và `retryAfterSeconds` khi có thể tính; frontend giữ tên/bản nháp, không làm mất ảnh.

#### 5.2. Ngân sách và cảnh báo

- Ngân sách ước tính theo tháng cho toàn app và key alias, có thể thêm user; cảnh báo mặc định đề xuất 70/90/100%, admin được cấu hình.
- Giai đoạn này hiển thị cảnh báo trong dashboard; không tự gửi email/Slack hoặc tích hợp kênh bên ngoài.
- Có công tắc backend ngừng yêu cầu AI mới để admin dùng khi cần. Thay đổi ngân sách/quota/giá/công tắc phải có audit người thao tác, thời gian và giá trị trước/sau đã làm sạch.
- Không gọi cảnh báo là hard spending cap. Nếu bổ sung chế độ chặn theo ngân sách, phải có reserve chi phí atomically, cận trên hợp lệ theo model/payload/max output và retry, xử lý unknown, đồng thời công bố sai số và không hứa chặn được phí phát sinh bên ngoài ứng dụng. Khi chưa có cận trên đáng tin, chỉ hỗ trợ soft alert và công tắc dừng.
- Ghi rõ key dùng ở dự án khác sẽ có phí ngoài sổ ứng dụng này. Nên dùng key/project riêng cho môi trường và tính năng để dễ đối soát; chỉ đề xuất, không tự tạo/xoay key.

#### 5.3. Retention và sức khỏe dữ liệu

- Đề xuất mặc định giữ raw log 90 ngày, tổng hợp ngày 12 tháng, cấu hình được và phải ghi rõ đây là đề xuất vận hành chứ không phải yêu cầu pháp lý.
- Nếu triển khai cleanup: tổng hợp trước, checkpoint theo ID/ngày, chạy lại không đếm đôi, không để dashboard cộng cả raw và rollup trùng thời gian. Không xóa dữ liệu cũ của hệ thống hiện tại.
- Giai đoạn đầu có thể chỉ cung cấp lệnh/job cleanup kiểm thử được; không tự bật destructive job trên production.
- Theo dõi pending quá lâu, attempt thiếu usage, lỗi ghi log, độ trễ dữ liệu và thời điểm dữ liệu bắt đầu. Có chỉ dẫn truy vết bằng request ID an toàn.
- Xóa user phải có chính sách FK/ẩn danh phù hợp: giữ tổng usage cần thiết nhưng không giữ email/tên snapshot vĩnh viễn. Không tự liên kết ngược toàn bộ lịch sử khách khi họ đăng nhập.

### 6. Giai đoạn C — mở rộng đề xuất, không chặn bàn giao A/B

Viết backlog ngắn, nêu lợi ích, dữ liệu/secret bổ sung và tiêu chí bật:

1. Đồng bộ OpenAI Usage/Costs bằng tài khoản có quyền phù hợp ở backend; đối soát theo ngày/project/API key ID nếu endpoint hiện hành hỗ trợ. Pagination, sync idempotent, watermark, độ trễ và chênh lệch múi giờ phải được xử lý. Thiếu quyền/credential thì dashboard vẫn hoạt động với ước tính nội bộ.
2. Phân biệt số tiền provider tổng hợp và chi phí app quy cho user. Không thể suy ra từng user trong ứng dụng từ một API key dùng chung nếu không có ledger nội bộ; không phân bổ chênh lệch hóa đơn tùy tiện.
3. Trang “Mức sử dụng của tôi”, chỉ đọc số liệu của chính user và quota còn lại; không tiết lộ key/cấu hình hoặc log user khác.
4. Cache gợi ý có TTL và khóa dữ liệu đúng quyền user; nếu dùng cache phải ghi cache hit và không tạo provider attempt/token mới. Chỉ làm khi đã có cách nhận diện ảnh hiệu quả, bảo vệ dữ liệu và điều kiện invalidation rõ ràng.
5. Cảnh báo bất thường/spike, giảm lỗi bằng circuit breaker cho lỗi provider kéo dài; tự động tắt phải có chính sách minh bạch và khả năng phục hồi.
6. Có thể mở rộng taxonomy cho AI sinh tên sản phẩm hoặc AI sinh ảnh thật khi các luồng đó được xây dựng; bổ sung đơn vị bill theo provider, không gộp với watermark local.

### 7. Kiểm thử và tiêu chí nghiệm thu

Viết test có ý nghĩa, bám hành vi và bảo mật; ưu tiên hạ tầng Node/jsdom/PGlite hiện có. Tối thiểu:

1. Tạo 10 ảnh, thành công 8, lỗi 2: ghi đúng số lượng, bộ đếm cũ không tăng hai lần. Hủy sau khi tạo 3 ảnh: ghi 3 ảnh thành công và phần chưa chạy đúng định nghĩa.
2. Tải 1 ảnh, direct nhiều ảnh, resize, ZIP có/không File System Access API, hủy picker, hủy giữa chừng, lỗi đóng gói/ghi file: event đúng và không chặn chức năng khi telemetry lỗi.
3. Chọn 13 ảnh AI, chia 6+6+1: một AI run, 3 logical request; nếu một batch có 2 provider attempt thì tổng là 4 attempt. Tổng business images 13; lượt ảnh gửi provider có thể lớn hơn vì retry và phải là chỉ số riêng.
4. Provider trả usage nhưng output invalid/refused/incomplete/missing IDs: usage vẫn lưu, trạng thái nghiệp vụ đúng. Unknown usage không biến thành 0.
5. 429/5xx/network/timeout và retry theo chính sách hiện có; lỗi auth/quota không bị retry vô ích. Không phát sinh retry OpenAI chỉ vì DB ghi log lỗi.
6. Test bảng giá với cached input, reasoning output không cộng đôi, model thiếu giá, đổi giá không sửa lịch sử, cộng request/attempt không đếm đôi.
7. Gửi cùng event/request ID hai lần, kể cả đồng thời: không đếm trùng và không gọi provider hai lần cho cùng thao tác. Cùng ID khác payload bị conflict; user khác không đọc/replay được kết quả của nhau.
8. Browser abort/đóng modal/mở lại draft/apply tên không tự phát sinh usage mới; lỗi ghi sau provider và pending bị treo được hiển thị trung thực.
9. Anon/user thường gọi thẳng API/RPC không đọc log toàn hệ thống, không ghi ledger, không sửa quota/giá, không giả user ID/plan/admin. Kiểm tra grants và RLS thực, không chỉ assertion frontend.
10. Đồng thời qua nhiều handler instance: quota/concurrency không vượt do race; lease hết hạn khôi phục được. Test đổi account với hàng đợi telemetry.
11. Dashboard/filter/export tổng đúng theo fixture, không tải toàn bảng; ngày Việt Nam đúng quanh 17:00 UTC; CSV không thực thi công thức từ dữ liệu người dùng.
12. Không lộ key/token/ảnh/prompt trong log, response, database metadata và CSV. Test sanitize lỗi provider.

Chạy `npm run test:ai-image-names`, bộ test mới, `npm run build`, và lint phù hợp. Báo riêng lỗi có sẵn và lỗi do thay đổi. PGlite/mock không thay thế kiểm thử Supabase Auth/PostgREST/Edge runtime thật: cung cấp smoke checklist local/staging và nói rõ phần chưa chạy nếu thiếu môi trường. Kiểm tra truy vấn tổng hợp/index bằng EXPLAIN với fixture đủ lớn khi có PostgreSQL phù hợp.

### 8. Đầu ra bàn giao

- Mã frontend/backend, migration qua quy trình Supabase của dự án, SQL quyền/index và cấu hình mẫu chỉ chứa tên biến/placeholder.
- Dashboard hoàn chỉnh trong navigation, giao diện tiếng Việt, phù hợp responsive và theme hiện có.
- Tài liệu mô hình event/ledger, định nghĩa KPI, mức tin cậy, cách tính giá, quota, failure policy, retention, nguồn dữ liệu cũ/mới và thời điểm bắt đầu theo dõi.
- Hướng dẫn thứ tự áp dụng migration, secrets, deploy function/frontend, smoke test, bật theo giai đoạn và rollback an toàn. Chuẩn bị đủ để review; không tự push/deploy production.
- Kết quả test thực tế, giới hạn chưa xác minh, checklist nghiệm thu A/B và backlog C. Không báo hoàn thành chức năng chưa có bằng chứng chạy được.

Trong quá trình làm, tự quyết các chi tiết có thể đảo ngược dựa trên cấu trúc hiện tại; chỉ hỏi khi thiếu dữ liệu thật sự quyết định nghiệp vụ. Mặc định phạm vi là watermark và đặt tên ảnh AI hiện có. Nếu thay đổi thiết kế đề xuất, giải thích ngắn lý do và chứng minh vẫn đạt tiêu chí nghiệm thu.

## Kết thúc prompt

## Tài liệu tham khảo cho agent

- [Supabase: Edge Function secrets](https://supabase.com/docs/guides/functions/secrets): quản lý secret phía server.
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): bảo vệ bảng exposed, chính sách và quyền truy cập.
- [OpenAI: Counting tokens](https://developers.openai.com/api/docs/guides/token-counting): cách hiểu usage, cached input và output token; số token output không chỉ là nội dung nhìn thấy.
- [OpenAI: Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs): dữ liệu chi phí tổng hợp, bộ lọc/nhóm và quyền API cần xác minh khi tích hợp.

Các link là nguồn đối chiếu kỹ thuật, không phải khẳng định dự án đã có quyền dùng mọi endpoint hay giá model cụ thể. Agent cần đọc schema và bảng giá hiện hành khi thực hiện.
