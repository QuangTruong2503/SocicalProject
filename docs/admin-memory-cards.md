# Thư viện ảnh Memory Game

Trang `/admin/memory-cards` dành cho quản trị viên đang hoạt động.

## Đã nâng cấp

- Thư viện dạng lưới responsive, xem trước ảnh trong khung vuông giống thẻ game và mở ảnh gốc.
- Tên ảnh, nhóm chủ đề, trạng thái đang bật/tạm ngưng, thùng rác và khôi phục. Nhóm dùng để tổ chức thư viện quản trị; các ảnh đang bật vẫn thuộc chung chủ đề “Bộ ảnh” trong game.
- Tìm kiếm theo tên, mã và nhóm; lọc nhóm/trạng thái; sắp xếp; phân trang phía server 24 ảnh/trang. Bộ lọc nằm trên URL.
- Thống kê toàn thư viện, số ảnh trong danh mục game, số tạm ngưng; lỗi tải ảnh ở trang hiện tại được ghi nhận riêng. Số danh mục là số bản ghi hợp lệ theo trạng thái/URL, không phải bảo đảm mọi máy đều tải được ảnh.
- Nút thao tác tối thiểu 44px, nút chọn ảnh dùng được bằng bàn phím; trạng thái tải, lỗi/thử lại và danh sách trống tách biệt.
- Hàng đợi tối đa 20 file, tên ảnh trước khi tải, nhóm chung cho đợt tải, kết quả từng file và thử lại file lỗi. File đã thành công không tải lại. Hàng đợi chỉ giữ trong tab hiện tại; nên giữ trang mở đến khi hoàn tất.
- Kiểm tra JPG/PNG/WebP, 1 byte–10 MB, tối thiểu 64×64px và tối đa 40 triệu điểm ảnh. Giải mã thật, tối ưu cạnh dài tối đa 1.024px, xuất WebP (hoặc định dạng canvas được hỗ trợ), giữ tỷ lệ và kiểm tra đầu ra dưới 5 MB. Không nhận SVG/GIF.
- Từ chối phản hồi danh sách cũ, khóa gửi lặp và kiểm tra phiên bản trước khi chỉnh/xóa/khôi phục.

## Danh mục game

Danh mục lấy tối đa 64 ảnh đang bật mới nhất, loại các bản ghi trùng **URL**. Nếu hai file khác URL nhưng có hình giống nhau, cần quản trị viên tạm ngưng một ảnh; hệ thống chưa nhận diện nội dung ảnh trùng bằng thị giác.

Game kiểm tra khả năng tải ảnh, cần 4/6/8 ảnh tải được cho mức Dễ/Vừa/Khó. Mỗi lần tạo ván ảnh mới sẽ lấy lại danh mục để phản ánh thay đổi quản trị. Nếu số ảnh giảm, độ khó được điều chỉnh hoặc dùng chủ đề Động vật khi dưới 4 ảnh; có thông báo. Nếu mất kết nối, giữ nguyên bàn hiện tại.

Ván đang chơi và bản lưu giữ nguyên bộ thẻ. Xóa mới là **xóa mềm**, giữ file trên Storage; không tự dọn file của ảnh trong thùng rác vì các ván đã lưu còn dùng URL đó. Ảnh đã tạm ngưng khi khôi phục vẫn giữ trạng thái tạm ngưng.

## Cài Supabase

Chạy toàn bộ [`20261015050622_memory_cards_management.sql`](../supabase/migrations/20261015050622_memory_cards_management.sql) trong SQL Editor của đúng dự án rồi bấm **Làm mới** trên trang.

Điều kiện: có `public.is_admin()` và `public.is_active_user()` từ `supabase_admin_profiles_policies.sql`. Migration độc lập với migration tài khoản/thử thách Memory Game và báo giá. Chạy lại được trong transaction; giữ nguyên các dòng ảnh và URL cũ.

Migration:

1. Nâng cấp bảng `public.memory_cards` hiện có, hoặc tạo bảng nếu chưa có. Thêm metadata, phiên bản và ngày xóa.
2. Thay toàn bộ policy cũ của **riêng bảng `memory_cards`** bằng policy đọc cho tài khoản active; nhân viên chỉ đọc ảnh đang bật/chưa xóa. Thu hồi quyền ghi trực tiếp và quyền truy cập ẩn danh.
3. Tạo bucket public riêng `memory-card-images` cho ảnh nguồn mới, giới hạn định dạng/dung lượng. Ảnh game dùng URL public; không tải ảnh riêng tư vào thư viện này. File và policy trong bucket cũ giữ nguyên.
4. Chỉ admin active tải ảnh mới. Không cấp quyền ghi đè; chỉ dọn upload chưa có bản ghi tham chiếu. Ảnh đã đăng ký, kể cả thùng rác, không được dọn bằng policy này.
5. Tạo các wrapper public `security invoker`, thực thi kiểm tra quyền trong schema private với `search_path` rỗng. **Không đưa `memory_cards_private` vào exposed schemas của Data API.**

RPC public:

| RPC | Chức năng |
| --- | --- |
| `memory_cards_catalog()` | Danh mục cho người chơi active, tối đa 64 URL khác nhau |
| `admin_list_memory_cards(...)` | Danh sách/bộ lọc/phân trang, số liệu và nhóm |
| `admin_save_memory_card(p_id,p_version,p_document)` | Đăng ký upload mới hoặc sửa metadata; sửa không được thay URL |
| `admin_change_memory_card(p_id,p_version,p_action)` | Xóa mềm/khôi phục, khóa dòng và kiểm tra phiên bản |

Nếu yêu cầu đăng ký ảnh mất phản hồi sau upload, giao diện không tự thử lại hay xóa file có thể đã được ghi nhận. Hãy **Làm mới** để kiểm tra trước khi chọn tải lại. File mồ côi sau sự cố mạng có thể cần quản trị Storage dọn thủ công.

## Trước khi chạy SQL

Trang dùng API cũ để xem, sắp xếp, phân trang và tải ảnh đã tối ưu vào bucket cũ. Metadata, tìm kiếm/lọc nâng cao, bật/tắt và thùng rác được khóa. Game cũ cũng chuyển sang lấy ảnh mới nhất. Không hiển thị số liệu toàn danh mục khi API cũ không cung cấp.

Migration chưa được áp dụng lên Supabase thật trong lượt triển khai: chưa có phiên quản trị CLI. SQL đã được chạy và chạy lại trên Postgres nhúng PGlite với bảng cũ cùng policy cho phép rộng để kiểm tra việc thu hồi quyền. Chưa chạy advisors trên dự án thật; cần kiểm tra các policy Storage toàn cục có thể áp dụng chéo bucket nếu dự án có cấu hình riêng.

## Kiểm thử

```powershell
npm run test:admin-memory
npm run test:memory
npm run test:memory:ui
npm run build
```

Bao phủ dữ liệu cũ, quyền anon/nhân viên/admin/tài khoản khóa, cập nhật đồng thời, URL ảnh không đổi khi sửa metadata, xóa/khôi phục, bảo vệ file đã tham chiếu, catalog 64 ảnh và URL trùng, truy vấn đảo thứ tự, phân trang, lỗi API, xác nhận một lần, upload trộn thành công/thất bại và tối ưu ảnh. Kiểm thử game xác nhận ván mới lấy catalog mới còn lỗi mạng giữ nguyên bàn.

Kiểm tra Chrome bằng thao tác đọc trên dữ liệu thật; không tải, sửa hoặc xóa ảnh thật trong quá trình QA. Bố cục thư viện và modal đã kiểm tra ở 320px/390px.
