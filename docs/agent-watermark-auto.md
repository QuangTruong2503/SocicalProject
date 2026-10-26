# Hướng dẫn AI Agent: Watermark tự động theo thư mục sản phẩm

Ngày lập: 26/10/2026. Đây là đặc tả để triển khai tính năng mới; việc tạo tài liệu này chưa đồng nghĩa tính năng đã được lập trình.

## 1. Nhiệm vụ và kết quả bắt buộc

Tạo trang con **`/watermark/auto`**, tên hiển thị **Watermark tự động**, có liên kết truy cập từ `/watermark` và liên kết quay lại. Giữ trải nghiệm logo, xem trước và điều chỉnh watermark quen thuộc của trang hiện tại.

Người dùng chọn các thư mục ảnh trên máy. Mỗi thư mục là một sản phẩm, **tên sản phẩm lấy từ tên thư mục**. Sau một lần bấm **Bắt đầu xử lý**, công cụ tự lần lượt đóng logo, đặt tên ảnh bằng AI, áp dụng kích thước và lưu kết quả vào thư mục **`Named` bên trong thư mục sản phẩm tương ứng**.

Ví dụ đầu vào:

```text
SanPham/
├── Máy khoan Bosch GSB 13 RE/
│   ├── IMG_001.jpg
│   └── IMG_002.png
└── Máy mài Makita 9553B/
    └── IMG_003.webp
```

Ví dụ kết quả; phần mô tả phụ thuộc nội dung AI nhìn thấy:

```text
SanPham/
├── Máy khoan Bosch GSB 13 RE/
│   ├── IMG_001.jpg
│   ├── IMG_002.png
│   └── Named/
│       ├── may-khoan-bosch-gsb-13-re-goc-nhin-mat-truoc.jpg
│       └── may-khoan-bosch-gsb-13-re-chi-tiet-tay-cam.jpg
└── Máy mài Makita 9553B/
    ├── IMG_003.webp
    └── Named/
        └── may-mai-makita-9553b-goc-nhin-ben-hong.jpg
```

Không đổi tên, di chuyển, ghi đè hoặc xóa ảnh nguồn. Không tự sửa tên thư mục sản phẩm.

## 2. Những điểm tinh chỉnh để yêu cầu rõ ràng và dễ dùng

| Vấn đề cần làm rõ | Quyết định triển khai |
| --- | --- |
| Chọn nhiều thư mục trong trình duyệt | Có **Thêm thư mục sản phẩm** để thêm từng thư mục và **Chọn thư mục cha** để nhập các thư mục con trực tiếp. Không giả định hộp thoại chọn thư mục hỗ trợ chọn nhiều mục cùng lúc. |
| Lấy tên sản phẩm | Dùng nguyên tên thư mục sau khi trim để gửi AI; chỉ bỏ dấu/chuẩn hóa khi tạo tên file. Hiển thị tên trước khi chạy. Không lấy tên thư mục cha làm tên chung. |
| Ý nghĩa 800×600px | Xuất đúng 800×600, giữ tỷ lệ, căn giữa, bù nền trắng; không kéo méo hoặc tự cắt sản phẩm. |
| Ý nghĩa kích thước gốc | Giữ chiều rộng/cao sau khi áp dụng hướng EXIF. Đây là giữ kích thước pixel, không phải giữ nguyên định dạng, metadata hoặc byte ảnh. |
| Định dạng xuất | Bản đầu dùng JPEG `.jpg`, nền trắng cho ảnh có alpha; giải thích ngắn cạnh dropdown. Kế thừa chất lượng JPEG hiện tại. |
| Đã có `Named` | Dùng lại thư mục; bỏ qua hoàn toàn khi quét đầu vào; chống trùng với mọi tên đã có. |
| AI chưa rõ ảnh | Tên dự phòng theo sản phẩm và số thứ tự, có nhãn **Cần kiểm tra**. Vẫn lưu để luồng tự động không dừng vì một ảnh khó nhận diện. |
| AI lỗi dịch vụ | Không coi là AI thành công và không tự lưu tên dự phòng. Giữ ảnh ở trạng thái lỗi/chờ để thử lại. |
| Dừng và thử lại | Giữ file đã lưu, ngừng xếp việc mới. Tiếp tục/thử lại chỉ xử lý phần chưa hoàn tất trong phiên hiện tại. |
| Giới hạn nền tảng | Luồng chuẩn cần quyền đọc/ghi thư mục do trình duyệt cấp. Chỉ chọn file hoặc `webkitdirectory` không cấp quyền lưu ngược vào thư mục nguồn. |

Các quyết định trên là mặc định của đặc tả, không cần hỏi lại người dùng khi triển khai, trừ khi xuất hiện hạn chế mới khiến không thể đáp ứng yêu cầu chính.

## 3. Đọc mã hiện có trước khi chỉnh sửa

Agent phải kiểm tra lại các đường dẫn và hợp đồng thực tế tại thời điểm triển khai; danh sách sau được đối chiếu khi lập tài liệu:

| Tệp | Vai trò và hướng tái sử dụng |
| --- | --- |
| `src/App.jsx` | Router và danh sách route có `ProtectedRoute`; thêm route mới theo cơ chế bảo vệ `/watermark`. |
| `src/pages/Watermark.jsx` | Trang hiện tại, cấu hình logo, preview, xử lý ảnh, thống kê và modal đặt tên AI. Chỉ thêm điểm truy cập và trích xuất phần dùng chung cần thiết. |
| `src/components/watermark/LogoUploader.jsx` | Chọn logo, khôi phục logo qua IndexedDB. |
| `src/components/watermark/WatermarkControls.jsx` | Điều chỉnh vị trí, kích thước, độ mờ, khoảng cách và chế độ lặp. |
| `src/components/watermark/WatermarkLivePreview.jsx` | Xem trước; trang mới cần phản ánh cả lựa chọn kích thước xuất. |
| `src/utils/watermarkOptions.js` | Giá trị mặc định và kiểm tra cấu hình lưu trước đó. |
| `src/utils/watermarkEngine.js` | Worker, fallback main thread, `setLogo`, `render`, `resize`, `dispose`. |
| `src/utils/watermarkRender.js` | Hàm vẽ chung, letterbox và `MAX_OUTPUT_DIMENSION = 4096`. |
| `src/hooks/useWatermarkProcessor.js` | Xuất JPEG, resize, chuẩn hóa và chống trùng tên trong danh sách. |
| `src/workers/watermark.worker.js` | Nhánh render/resize trong worker; phải nhất quán với fallback. |
| `src/utils/aiImageNaming.js` | Tạo ảnh nhỏ cho AI, parse theo ID, slug, ghép tên, chia lô. |
| `src/services/imageNameService.js` | `requestImageNameSuggestions`, quyền AI, lỗi, timeout, `requestId` và cơ chế gửi lại. |
| `src/hooks/useAiNamingAccess.js` | Nguồn quyền và model được phép hiển thị cho tài khoản. |
| `src/components/watermark/AiRenameModal.jsx` | Tham khảo luồng AI, prompt đã lưu, model, xử lý phản hồi cũ; không dùng modal làm bộ điều phối tự động. |
| `docs/ai-image-naming.md`, `docs/usage-logging.md` | Hợp đồng endpoint, phân quyền, giới hạn, usage và telemetry đang có. |

Không viết thêm dịch vụ AI độc lập hoặc nhúng API key vào frontend. Tái sử dụng endpoint `suggest-image-names` hiện có cùng kiểm tra quyền/model/usage phía server. Không thay schema dữ liệu chỉ để lưu các ảnh đang xử lý trên máy.

## 4. Hỗ trợ trình duyệt và quyền thư mục

### 4.1. Luồng bắt buộc: lưu trực tiếp

- Nhắm tới Chrome/Edge desktop có File System Access API; kiểm tra khả năng thực tế thay vì chỉ kiểm tra tên trình duyệt.
- Kiểm tra `window.isSecureContext`, `showDirectoryPicker` và khả năng ghi của handle. Môi trường chạy là HTTPS hoặc localhost được trình duyệt coi là an toàn.
- Gọi `showDirectoryPicker({ mode: 'readwrite' })` trực tiếp từ thao tác bấm nút. Mỗi lần gọi trả một directory handle.
- Khi cần xin lại quyền, dùng `queryPermission`/`requestPermission` với `mode: 'readwrite'`. Thao tác xin quyền phải gắn với nút người dùng bấm, không phát sinh trong vòng lặp nền sau một lần gọi AI dài.
- Xin quyền trước khi xử lý ảnh/gọi AI. Với thư mục cha, dùng phạm vi truy cập đã được cấp và kiểm tra khả năng ghi của từng thư mục sản phẩm; không tự mở hàng loạt hộp thoại xin quyền.
- Từ chối quyền: hiển thị thư mục chưa đủ quyền và nút cấp lại quyền hoặc bỏ khỏi lượt chạy; không phát sinh chi phí AI cho thư mục chưa được phép ghi.
- Hủy hộp thoại chọn thư mục là thao tác bình thường; không xóa danh sách đã chọn và không báo lỗi nghiêm trọng.
- Chỉ hiển thị đường dẫn tương đối/tên handle; không giả định trình duyệt cung cấp đường dẫn tuyệt đối trên máy.

Trình duyệt không hỗ trợ: hiển thị lý do và hướng dẫn mở bằng trình duyệt hỗ trợ; khóa chế độ lưu trực tiếp. **Không giả vờ đã tạo `Named` trên máy bằng một file ZIP.** Fallback chọn bằng `webkitdirectory` và tải ZIP có thể làm ở giai đoạn sau, với nhãn rõ cần giải nén thủ công; không phải điều kiện hoàn thành bản đầu.

### 4.2. Quy tắc chọn và quét thư mục

1. **Thêm thư mục sản phẩm:** thư mục được chọn chính là sản phẩm; đọc các ảnh nằm trực tiếp trong thư mục.
2. **Chọn thư mục cha:** liệt kê thư mục con trực tiếp thành danh sách sản phẩm có checkbox. Không lấy các ảnh ở gốc thư mục cha; báo số ảnh bị bỏ qua ở đây.
3. Không quét đệ quy mặc định. Thông báo ngắn: “Chỉ xử lý ảnh nằm trực tiếp trong thư mục sản phẩm.” Không tự nhận các thư mục cháu là sản phẩm khác.
4. Bỏ qua thư mục tên `Named` không phân biệt hoa/thường, kể cả khi chọn thư mục cha. Nếu người dùng chọn thẳng `Named`, báo đây là thư mục kết quả và yêu cầu chọn thư mục sản phẩm.
5. Dùng `isSameEntry` khi có handle để loại cùng một thư mục được thêm nhiều lần, kể cả thêm riêng rồi chọn qua thư mục cha. Hai thư mục khác nhau có cùng tên vẫn là hai sản phẩm riêng, có ID riêng.
6. Sắp xếp thư mục/ảnh ổn định theo tên với thứ tự số tự nhiên, rồi chụp danh sách cho lượt chạy. Số thứ tự tên dự phòng không thay đổi khi thử lại.
7. Bản đầu nhận JPEG/JPG, PNG và WebP. Kiểm tra cả loại file/đuôi và khả năng decode; file hỏng vẫn có thể mang đuôi hợp lệ. Liệt kê số file không hỗ trợ, không đưa chúng vào hàng đợi AI.
8. Thư mục trống/không có ảnh hợp lệ có trạng thái riêng, mặc định bỏ chọn. Không tạo `Named` rỗng chỉ do quét.
9. Nếu phát hiện `Named` dạng thư mục với cách viết hoa/thường khác, dùng đúng handle đã có để tránh tạo kết quả cạnh tranh. Nếu `Named` đang là một file, báo lỗi của sản phẩm đó.
10. Không tự dò ổ đĩa hoặc truy cập thư mục ngoài các handle người dùng đã chọn.

## 5. Giao diện và luồng thao tác

### Bước 1 — Chọn thư mục

- Tiêu đề **Watermark tự động**, mô tả: “Chọn thư mục sản phẩm. Công cụ tự chèn logo, đặt tên AI và lưu vào Named.”
- Hai nút chọn thư mục như mục 4, nút xóa danh sách và bỏ từng sản phẩm.
- Bảng gồm chọn/bỏ chọn, tên sản phẩm, đường dẫn tương đối để phân biệt tên trùng, số ảnh hợp lệ, số file bỏ qua và trạng thái quyền ghi.
- Hiển thị tổng sản phẩm và tổng ảnh đã chọn. Có thông báo rõ khi ảnh trong thư mục con sâu hơn bị bỏ qua.

### Bước 2 — Cấu hình chung

- Chọn logo một lần cho toàn bộ lượt chạy; tái sử dụng cấu hình watermark hợp lệ hiện có. Bắt buộc có logo đọc được trước khi bắt đầu.
- Dropdown **Kích thước ảnh xuất** có đúng hai lựa chọn: **800 × 600 px** (mặc định) và **Kích thước gốc**.
- Chú thích: “Ảnh xuất dạng JPG. 800 × 600 giữ tỷ lệ và thêm nền trắng khi cần.”
- Chọn model từ danh sách tài khoản được cấp, dùng cơ chế mặc định của chức năng AI hiện tại; không hardcode thêm danh sách riêng.
- Prompt mặc định và prompt đã lưu dùng chung quy tắc của `/watermark`; phần chỉnh prompt đặt trong **Nâng cao**. Không yêu cầu nhập tên sản phẩm chung vì mỗi thư mục đã cung cấp tên.
- Preview một ảnh mẫu, có chọn sản phẩm/ảnh để xem các tỷ lệ khác nhau. Preview khớp logo, nền và cách resize của file thực tế.
- Hiển thị trước khi chạy: “Ảnh được xử lý trên máy. Bản ảnh nhỏ được gửi tới dịch vụ AI để đặt tên.” Không khẳng định toàn bộ quy trình offline.
- Hiển thị nơi lưu dưới dạng `<thư mục sản phẩm>/Named`; không yêu cầu chọn một thư mục xuất chung.

### Bước 3 — Bắt đầu và theo dõi

- Nút **Bắt đầu xử lý** bật khi có ảnh hợp lệ, logo hợp lệ, model được cấp và quyền ghi đủ cho các sản phẩm đã chọn.
- Trước lượt chạy, kiểm tra lại quyền, phiên đăng nhập, tên sản phẩm theo giới hạn backend và cấu hình. Nếu tên thư mục vượt giới hạn, nêu đúng sản phẩm cần sửa tên trên máy rồi chọn lại; không âm thầm cắt tên hoặc gửi một tên sản phẩm khác.
- Nếu chưa có quyền AI, hiển thị thông báo và lối kiểm tra lại quyền; không tự chuyển sang tên đánh số để thay thế yêu cầu đặt tên AI.
- Chụp cấu hình bất biến cho lượt chạy; khóa các ô cấu hình, thêm/xóa thư mục và thao tác bắt đầu lặp khi đang chạy.
- Hiển thị tổng tiến độ, sản phẩm hiện tại, số đã lưu/lỗi/cần kiểm tra và công đoạn hiện tại: đọc ảnh, chèn logo, đặt tên AI, chỉnh kích thước, lưu.
- Có **Dừng** khi chạy; khi dừng hoặc gặp lỗi toàn cục có **Tiếp tục phần còn lại**; ảnh lỗi có **Thử lại ảnh lỗi**. Các nút tiếp tục/thử lại phải dùng lại cấu hình đã chụp.
- Trạng thái sản phẩm: Chờ / Đang xử lý / Hoàn tất / Hoàn tất một phần / Lỗi / Không có ảnh hợp lệ. Trạng thái chờ quyền hoặc hạn mức có thông điệp riêng.
- Mở rộng từng sản phẩm để thấy tên nguồn → tên xuất, trạng thái ảnh và lỗi dễ hiểu. Không render hàng nghìn ảnh/full blob preview đồng thời.

### Bước 4 — Kết thúc

- Thông báo: “Đã lưu X/Y ảnh trong Named của N sản phẩm; E ảnh lỗi; R ảnh cần kiểm tra.” Số cần kiểm tra là tập con của ảnh đã lưu, không cộng lần hai vào tổng.
- Có thể sao chép báo cáo hoặc tải báo cáo JSON/CSV theo thao tác người dùng, gồm ánh xạ nguồn/kết quả và lỗi; báo cáo không gửi lên server.
- Chỉ báo thành công sau khi stream ghi file đã `close()` thành công. Nếu có lỗi hoặc còn ảnh chờ, kết quả phải là hoàn tất một phần.
- Bản đầu bảo đảm tiếp tục trong phiên đang mở. Tải lại/đóng tab phải chọn thư mục lại; không hứa khôi phục đầy đủ qua reload, chạy nền khi đóng trình duyệt hoặc tự mở File Explorer.

## 6. Bộ điều phối xử lý bắt buộc

### 6.1. Thứ tự và giới hạn tài nguyên

- Xử lý **từng sản phẩm tuần tự**; hoàn tất hoặc ghi nhận lỗi sản phẩm hiện tại rồi chuyển sản phẩm tiếp theo, trừ khi phải dừng toàn cục.
- Chia ảnh của cùng một sản phẩm thành lô theo giới hạn endpoint hiện tại (khi lập tài liệu: tối đa 6 ảnh/request). Không ghép ảnh của hai sản phẩm vào request chỉ có một `productName`.
- Mặc định một request AI đang chạy. Giới hạn toàn cục không vượt cơ chế hiện tại; không nhân concurrency theo số folder hoặc số ảnh.
- Với mỗi lô: đọc ảnh → render logo → tạo bản ảnh nhỏ cho AI từ **ảnh nguồn chưa có logo** → gọi AI với tên thư mục → ghép tên theo ID → áp dụng kích thước → lưu lần lượt → giải phóng blob/bitmap/URL/canvas.
- Ưu tiên xử lý và lưu từng lô, không watermark tất cả ảnh rồi giữ toàn bộ trong RAM. Chỉ giữ full blob trong lô đang làm; danh sách kết quả chủ yếu là metadata và thumbnail giới hạn.
- Mỗi ảnh có ID ổn định riêng, gắn với product ID và file nguồn trong lượt chạy. Không dùng tên file đơn lẻ làm khóa và không khớp kết quả AI theo vị trí mảng.
- Không dùng giới hạn 60 ảnh mỗi lần bấm của modal hiện tại làm giới hạn tổng của trang tự động. Hàng đợi phải đi qua toàn bộ ảnh đã chọn, chia request đúng giới hạn, đồng thời tôn trọng quota/rate limit phía server.
- Không tăng quota, tạo danh tính mới, xoay endpoint hoặc tự lặp request liên tục để né hạn mức. Khi server yêu cầu chờ, dừng xếp lô mới, hiện thông báo; chỉ cho tiếp tục khi điều kiện được khắc phục/thời gian chờ đã hết.

### 6.2. Quy tắc kích thước và logo

**800×600:** có thể tái sử dụng hành vi hiện có: render watermark giữ tỷ lệ rồi gọi `engine.resize(blob, 800, 600)` để letterbox. Preview phải theo đúng thứ tự này. Logo đi cùng ảnh sản phẩm, không tự nhảy ra phần lề trắng mới thêm. Không kéo ảnh nguồn trực tiếp thành 800×600 trong hàm vẽ làm méo ảnh. Không encode lặp ngoài các bước cần thiết.

**Kích thước gốc:** engine hiện lấy `MAX_OUTPUT_DIMENSION = 4096` nếu không truyền override. Không được gọi mặc định rồi gắn nhãn là kích thước gốc. Mở rộng/tái sử dụng tham số render để tắt thu nhỏ riêng cho chế độ này (ví dụ `maxDimension: 0` sau khi xác minh cả worker/fallback hiểu nhất quán). Không đổi mặc định của `/watermark` hiện tại.

Decode đúng hướng EXIF, tránh xoay hai lần giữa `createImageBitmap` và `<img>`. Ảnh gốc 6000×4000 phải ra 6000×4000 nếu xử lý được; ảnh portrait xoay EXIF phải dùng kích thước sau định hướng. Khi vượt khả năng canvas/bộ nhớ của thiết bị, báo lỗi ảnh đó và gợi ý chuyển sang 800×600 cho lượt mới; không âm thầm thu nhỏ trong chế độ gốc. Không có một giới hạn canvas chung được bảo đảm cho mọi trình duyệt.

### 6.3. Quy tắc đặt tên

- `productName` gửi endpoint = tên thư mục sản phẩm, không dùng cấu hình `options.productName` đã lưu từ trang cũ.
- Tái sử dụng hợp đồng AI và tiện ích slug hiện có. Backend hiện trả `suggestedName`; frontend dùng `parseSuggestionResponse` để kiểm tra theo ID. Không giả định frontend nhận trực tiếp trường `descriptor` của mô hình.
- Tên cuối: `slug-ten-san-pham-mo-ta.jpg`; chữ thường, không dấu, dấu gạch ngang, an toàn với Windows. Giới hạn độ dài theo helper/hợp đồng hiện có và chừa chỗ cho hậu tố chống trùng cùng `.jpg`.
- Ảnh AI nhận diện không rõ hoặc mâu thuẫn với tên sản phẩm: dùng tên hợp lệ mà hợp đồng trả về hoặc tên dự phòng `slug-ten-san-pham-001.jpg`, đánh dấu **Cần kiểm tra**. Không tự đổi tên sản phẩm theo suy đoán từ ảnh.
- AI trả thiếu/trùng/ID lạ, payload hỏng, từ chối hoặc lỗi request: đánh dấu các ID không có kết quả hợp lệ; không lấy mô tả ảnh khác gán sang.
- Chống trùng trong phạm vi **từng `Named`**, bao gồm tên đã có trên đĩa và tên đã giữ chỗ trong lượt chạy; so sánh không phân biệt hoa/thường. Nếu trùng, thêm `-2`, `-3`… trước đuôi.
- Không chỉ dùng `getUniqueFileNames` trên lô hiện tại: helper đó chưa biết file đã tồn tại hoặc các lô trước. Bổ sung tập tên đã dùng cho từng thư mục và kiểm tra lại ngay trước khi tạo file.
- Chống trùng dựa trên thứ tự nguồn đã chụp; không dựa trên thứ tự request AI trả xong.

### 6.4. Ghi vào `Named`

1. Chỉ tạo `Named` khi chuẩn bị lưu ảnh đầu tiên bằng `getDirectoryHandle('Named', { create: true })`, hoặc dùng handle đã phát hiện ở bước quét.
2. Liệt kê tên hiện có; giữ một bộ cấp tên tuần tự cho mỗi thư mục để tránh hai tác vụ tự ghi đè nhau.
3. Đảm bảo tên là basename an toàn, không chứa đường dẫn hoặc `..` làm segment. Không biến đường dẫn do AI trả về thành truy cập ngoài thư mục.
4. Kiểm tra lại đích ngay trước khi tạo handle; có file/thư mục cùng tên thì cấp hậu tố mới. Không mở stream ghi lên file đã có từ trước.
5. Tạo file đích, `createWritable()`, `write(blob)`, `close()`; chỉ sau đó chuyển ảnh sang `saved`.
6. Nếu ghi lỗi, đóng/hủy stream theo API, ghi nhận lỗi. Chỉ dọn file mới do chính lượt chạy tạo mà chắc chắn chưa hoàn tất; không xóa file có sẵn hoặc file đã lưu thành công.
7. Cache tên AI và tên đích đã cấp trong phiên; thử lại lỗi ghi không gọi lại AI nếu nguồn/cấu hình vẫn khớp. Có thể render lại từ ảnh gốc để tiết kiệm RAM; tuyệt đối không lấy ảnh có logo làm nguồn để đóng logo lần hai.
8. File nguồn bị sửa/xóa trong lúc chạy: đọc lại thông tin qua handle; nếu khác snapshot, báo lỗi nguồn đã thay đổi và yêu cầu quét lại. Không áp dụng tên AI cũ cho nội dung mới.

File System Access API không cung cấp lời hứa khóa toàn thư mục với mọi ứng dụng khác. Giữ một bộ ghi trong ứng dụng, kiểm tra tồn tại sát lúc ghi, và hướng dẫn ngắn không chỉnh `Named` bằng ứng dụng khác trong lượt chạy. Không tuyên bố bảo đảm giao dịch giữa nhiều ứng dụng.

## 7. Dừng, lỗi và thử lại

| Tình huống | Xử lý bắt buộc |
| --- | --- |
| Ảnh hỏng/không decode được | Lỗi ảnh đó, không gọi AI cho ảnh; tiếp tục ảnh khác. |
| Một ảnh thiếu kết quả AI | Chỉ lỗi ảnh đó; các kết quả hợp lệ trong cùng lô vẫn tiếp tục. |
| AI `needsReview` | Lưu tên hợp lệ, tăng số cần kiểm tra; không xem là lỗi kỹ thuật. |
| Mất mạng/timeout | Dùng retry có sẵn; hết retry thì tạm dừng hàng đợi, cho tiếp tục phần còn lại. |
| Hết phiên/mất quyền model/quota/tạm dừng AI/thiếu cấu hình | Dừng xếp request AI mới, thông báo đúng mã lỗi. Có nút kiểm tra quyền hoặc tiếp tục sau khi khắc phục; không thử lại vô hạn. |
| Thư mục riêng mất quyền/ổ đĩa rời bị ngắt | Tạm dừng sản phẩm đó, có nút cấp quyền/chọn lại; các sản phẩm độc lập còn quyền có thể tiếp tục. |
| Hết dung lượng hoặc lỗi ghi toàn hệ thống | Dừng ghi và tạm dừng lượt chạy để tránh tạo hàng loạt lỗi. |
| Người dùng bấm Dừng | Không xếp lô/ảnh mới, abort request có thể hủy, bỏ phản hồi cũ. File đang ghi phải kết thúc hoặc hủy có kiểm soát trước khi báo đã dừng. |
| Tiếp tục trong phiên | Bỏ qua ảnh `saved`; dùng lại tên AI đã có và cùng snapshot cấu hình. |
| Thử lại lỗi ghi | Không gọi AI lần hai nếu kết quả đã có; dựng lại blob từ nguồn khi cần. |
| Bắt đầu lượt mới sau khi đã hoàn thành | Có thể tạo bản mới với hậu tố; không hứa tự nhận diện ảnh đã xử lý ở phiên trước. `Named` vẫn luôn bị loại khỏi đầu vào. |

Phân biệt rõ `stopped/paused` với lỗi vĩnh viễn. Ảnh chưa chạy vì dừng không được tính là ảnh lỗi AI. Phản hồi thuộc run ID cũ hoặc sau unmount không được ghi thêm file/cập nhật state. Abort phía browser không bảo đảm hủy chi phí của request AI đã tới server; không báo chắc chắn chưa phát sinh chi phí.

Tái sử dụng `requestId` cho việc gửi lại **cùng payload** theo service hiện có; dùng ID mới cho lô mới hoặc lượt thử lại đã đổi payload. Không viết thêm tầng retry chồng lên service làm nhân số lần gọi. Nếu service cần lộ thêm `retryAfterSeconds`, mở rộng hợp đồng theo cách tương thích thay vì parse thời gian từ câu thông báo.

## 8. Gợi ý cấu trúc triển khai

Tên tệp có thể điều chỉnh theo convention dự án, nhưng tách rõ trách nhiệm:

```text
src/pages/WatermarkAuto.jsx
src/components/watermark/auto/ProductFolderPicker.jsx
src/components/watermark/auto/AutoProcessingProgress.jsx
src/hooks/useWatermarkAutoProcessor.js
src/utils/productFolderAccess.js
src/utils/watermarkAutoNaming.js
src/styles/WatermarkAuto.css
```

- Trang quản lý bố cục và cấu hình; hook điều phối hàng đợi/state machine; lớp folder access quét/cấp tên/ghi file; helper naming kết hợp quy tắc tên có sẵn với tập file đã có.
- Metadata gợi ý: `runId`, snapshot options/model/prompt/outputSize; product `{ id, name, relativePath, directoryHandle, status }`; image `{ id, productId, sourceHandle, sourceName, size, lastModified, index, status, suggestedName, outputName, needsReview, errorCode }`.
- Trạng thái ảnh tối thiểu: `queued → rendering → naming → resizing → writing → saved`, kèm `error`, `cancelled`; có thể biểu diễn công đoạn bằng trường riêng để xử lý theo lô.
- Handles chỉ giữ trong bộ nhớ cho bản đầu; không serialize vào localStorage. Không thêm lưu full ảnh vào database/storage.
- Dùng React và engine hiện có; không cần desktop app, browser extension, local server hoặc thư viện xử lý ảnh mới cho luồng chuẩn.
- Trích xuất logic dùng chung vừa đủ, tránh sao chép toàn bộ `Watermark.jsx` hoặc sửa lớn trang cũ. Giữ hỗ trợ theme, focus, label và thông báo tiếng Việt.

## 9. Auth, usage và dữ liệu

- Route mới dùng cùng `ProtectedRoute` như `/watermark`. Kiểm tra quyền AI qua hook hiện có; backend vẫn là nơi quyết định quyền mỗi request.
- Không đưa key OpenAI, service-role key hoặc logic tự cấp quyền xuống browser. Không sửa giới hạn backend để hàng đợi có thể chạy vượt quota.
- Gửi AI bản sao nhỏ từ helper hiện có (hiện cạnh dài tối đa 512px); không upload full ảnh lên Storage. Tên sản phẩm vẫn phải gửi tới endpoint để AI đặt tên đúng.
- Không đưa tên file, tên sản phẩm, đường dẫn, ảnh base64 hoặc prompt vào telemetry/console phía server. Báo cáo cục bộ do người dùng tải được phép chứa tên file để đối chiếu.
- Tái sử dụng usage server của AI; không gọi trực tiếp nhà cung cấp để bỏ qua sổ usage/idempotency.
- Tích hợp thống kê theo semantics hiện có: tạo ảnh khác với lưu thành công. Retry chỉ ghi lại file từ kết quả đã có không được tăng lại số ảnh đã tạo hoặc số lượt AI.
- Nếu ghi telemetry theo trang, truyền `sourcePage: 'watermark/auto'` qua helper theo cách tương thích; hiện `src/utils/usageEvents.js` hardcode `watermark`, cần kiểm tra trước khi tái sử dụng. Giữ giá trị mặc định cho trang cũ.
- Lưu trực tiếp dùng taxonomy `downloadMethod: 'direct'` và `imageSize: 'original' | '800x600'` hiện có; xác minh các trường delivery/đếm trước khi gửi. Không tự bịa enum mới gây lỗi constraint.
- Lỗi telemetry phía client không được làm mất file hoặc lặp xử lý. Lỗi kiểm tra/quản lý usage AI phía server vẫn phải chặn request theo hợp đồng đang có.

## 10. Các bước để Agent thực thi

1. Đọc hướng dẫn repository và các tệp mục 3; xác minh route, helper, endpoint, giới hạn và bộ test thực tế. Tôn trọng thay đổi đang có trong working tree.
2. Thêm lớp đọc/ghi thư mục và quy tắc chọn sản phẩm; kiểm tra chống trùng với file có sẵn trước khi nối AI.
3. Bổ sung chế độ kích thước gốc cho engine nếu cần; bảo toàn mặc định và hành vi trang hiện tại ở cả worker/fallback.
4. Xây bộ điều phối theo lô, ID ổn định, snapshot, dừng/tiếp tục/retry, giải phóng tài nguyên; nối service AI có sẵn.
5. Xây trang `/watermark/auto`, preview, picker, bảng tiến độ, báo cáo; thêm liên kết tại `/watermark` và route có bảo vệ.
6. Nối usage/thống kê cần thiết theo hợp đồng hiện có, kiểm tra không đếm lại khi thử ghi file.
7. Thêm test hành vi cho luồng mới, chạy kiểm tra hồi quy liên quan và thử thực tế trên trình duyệt hỗ trợ với thư mục tạm.
8. Cập nhật tài liệu sử dụng, giới hạn và kết quả kiểm chứng. Không tuyên bố đã thử ghi thư mục thật hoặc gọi AI thật nếu mới dùng mock.

## 11. Tiêu chí nghiệm thu

- [ ] Từ `/watermark` mở được `/watermark/auto`; truy cập trực tiếp URL mới cũng đúng, có auth và quay lại được.
- [ ] Thêm riêng hai thư mục hoặc chọn thư mục cha tạo đúng hai sản phẩm; mỗi request AI dùng đúng tên thư mục tương ứng.
- [ ] Hai thư mục khác nhau cùng tên không bị gộp; cùng một handle thêm hai lần không bị xử lý hai lần.
- [ ] Ảnh gốc được giữ nguyên. Mọi ảnh thành công nằm ở `<sản phẩm>/Named`, đều có logo, tên hợp lệ và đúng kích thước chọn.
- [ ] Ảnh ngang/dọc/vuông/alpha xuất đúng 800×600, không méo hoặc cắt, nền trắng và preview đúng kết quả.
- [ ] Chế độ gốc không bị clamp 4096px: thử ảnh 6000×4000 trên thiết bị đủ khả năng; thử ảnh xoay EXIF và cả worker/fallback.
- [ ] Thư mục `Named` có sẵn, `named`, file trùng khác hoa/thường và tên AI trùng giữa các lô đều không bị ghi đè hoặc đưa ngược vào đầu vào.
- [ ] File tên `Named` gây lỗi rõ ràng; thư mục trống, file hỏng và file ngoài định dạng được báo đúng.
- [ ] Phản hồi AI đảo thứ tự/thiếu/trùng/ID lạ không gán nhầm tên; ảnh cần kiểm tra vẫn lưu và có cờ trong báo cáo.
- [ ] Hàng đợi lớn hơn 60 ảnh đi tiếp qua nhiều lô khi quyền và quota cho phép; mỗi request không vượt giới hạn backend, không trộn sản phẩm.
- [ ] Dừng giữa lượt không xóa ảnh đã lưu, không phát sinh ghi mới từ phản hồi cũ; tiếp tục không xử lý lại ảnh đã `saved`.
- [ ] Lỗi ghi rồi thử lại không gọi lại AI nếu kết quả còn hợp lệ; ảnh nguồn thay đổi không dùng tên AI/cache cũ.
- [ ] Từ chối/mất quyền ghi, hết phiên, mất quyền model, timeout, rate limit, quota và hết dung lượng có hành vi đúng mục 7.
- [ ] Trình duyệt không hỗ trợ hiển thị giới hạn trước khi chạy; không báo đã tạo thư mục bằng cách tải ZIP.
- [ ] Tài nguyên được giải phóng sau từng lô/dừng/unmount; thử nhiều ảnh không giữ toàn bộ full blob trong state.
- [ ] Chức năng `/watermark` cũ và đặt tên AI thủ công vẫn hoạt động; không lộ tên/đường dẫn/ảnh vào telemetry.

Kiểm tra tự động phù hợp: test lớp folder access bằng handle/stream giả lập; test điều phối với AI giả lập và thứ tự phản hồi khác nhau; test UI cho quyền, snapshot và dừng; test renderer cho kích thước gốc/letterbox trên cả hai nhánh. Mock không thay thế kiểm tra quyền thư mục, EXIF, canvas và ghi thật trên Chrome/Edge.

Lệnh kiểm tra hiện có cần chọn theo phần thay đổi:

```text
npm run build
npm run test:ai-image-names
node --test tests/watermarkProcessor.test.mjs
npm run test:usage       # khi chạm usage/telemetry
npm run lint            # ghi rõ lỗi tồn tại từ trước nếu có
```

Thêm lệnh/script riêng cho test mới theo convention dự án; không tạo test chỉ kiểm tra chuỗi tên component hoặc sao chép chi tiết implementation.

## 12. Phạm vi bản đầu và phần có thể mở rộng sau

**Bắt buộc:** chọn thư mục, nhận diện sản phẩm theo folder, logo/cấu hình dùng chung, AI tự động, hai kích thước, lưu trực tiếp vào `Named`, chống trùng, tiến độ, dừng/tiếp tục trong phiên, thử lại lỗi, báo cáo và kiểm tra hồi quy.

**Để sau:** ZIP fallback, HEIC/TIFF/AVIF/GIF/SVG làm ảnh nguồn, quét đệ quy, đổi tên sản phẩm độc lập với folder, xử lý theo lịch, khôi phục qua reload, manifest nhận diện ảnh đã xử lý ở phiên trước, tự đồng bộ thư mục, sửa ảnh đã lưu hàng loạt. Không tự thêm các phần này làm chậm yêu cầu chính.

## 13. Tài liệu nền tảng đã đối chiếu

- [Chrome: File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access): truy cập qua quyền người dùng, directory handle, ghi stream và chỉ hoàn tất khi đóng stream.
- [MDN: showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker): một directory handle, tùy chọn `readwrite`, secure context và thao tác người dùng.
- [MDN: requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission): xin quyền đọc/ghi; không coi quyền đã cấp là tồn tại vĩnh viễn.
- [MDN: webkitdirectory](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory): chọn file theo cấu trúc thư mục và đường dẫn tương đối; không thay thế writable directory handle.

Agent cần xác minh lại hỗ trợ API ở trình duyệt mục tiêu khi triển khai. Các quy tắc quota, model, auth và payload ưu tiên hợp đồng mã nguồn hiện hành thay vì sao chép giá trị trong tài liệu này một cách máy móc.
