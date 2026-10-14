# Memory Game v2

Trang `/memory-game` có 3 chủ đề biểu tượng dùng được khi mất kết nối sau khi
trang đã tải, bộ ảnh quản trị được kiểm tra trước khi chọn, 3 độ khó (4/6/8 cặp),
âm thanh tùy chọn, thời gian chơi, tạm dừng, lịch sử và tiếp tục ván đã lưu.
Kỷ lục tách theo tài khoản, chủ đề, số cặp và chế độ; số lượt ít hơn được ưu tiên,
sau đó đến thời gian. Kỷ lục chung `memoryGameBestScore` của phiên bản trước
không được gán cho một tài khoản cụ thể vì không xác định được chủ sở hữu.

## Kích hoạt database

1. Database cần có `public.is_active_user()` từ
   `supabase_admin_profiles_policies.sql`.
2. Mở file `supabase/migrations/20261014153530_memory_game_v2.sql`, chạy toàn bộ
   trong Supabase SQL Editor bằng tài khoản quản trị. Có thể chạy lại an toàn.
3. Giữ `memory_game_private` **ngoài** danh sách schema được Data API expose.
   Client chỉ gọi các RPC ở schema `public`.
4. Tải lại `/memory-game`, kiểm tra trạng thái đồng bộ, chơi thử thách, rồi xem
   kết quả trên bảng xếp hạng. Đăng nhập một tài khoản khác để kiểm tra cô lập.

Khi RPC chưa được cài đặt hoặc mất kết nối, game vẫn dùng bộ biểu tượng,
lưu trên thiết bị nếu trình duyệt cho phép và chơi thử thách luyện tập.
Luyện tập được ghi rõ và không lên bảng xếp hạng. Giao diện không hiển thị lỗi
SQL, tên bảng, khóa API hoặc yêu cầu người chơi xử lý cấu hình backend.

## Lưu và đồng bộ

- Local storage dùng khóa `memory-game:v2:<user-id>`. Dữ liệu được kiểm tra trước
  khi khôi phục; storage bị chặn hoặc JSON hỏng không làm game dừng hoạt động.
- Ván đã lưu được tiếp tục bằng thao tác rõ ràng, ở trạng thái tạm dừng. Thẻ lẻ
  đang mở được đóng lại, còn thứ tự bàn, cặp đã ghép, lượt và thời gian được giữ.
- Đồng bộ tiến trình được gom mỗi 8 giây và thử lại khi có mạng; kết quả hoàn
  thành được lưu sớm. Không đổi bàn chơi khi ảnh hoặc dữ liệu tài khoản tải về.
- RPC lưu kiểm tra phiên bản. Nếu thiết bị khác đã lưu, server trả `40001`.
  Lịch sử/kỷ lục được gộp; người chơi chọn giữ ván trên thiết bị hoặc tiếp tục
  ván trên tài khoản. Không tự ghi đè một ván khác.
- Lịch sử riêng giữ tối đa 50 ván; giao diện hiển thị 10 ván gần nhất. Đây là dữ
  liệu client gửi lên và **không** được dùng để cấp thứ hạng công khai.

## Thử thách xếp hạng

- Server tạo một bàn ngẫu nhiên gồm 6 cặp cho mỗi ngày theo múi giờ
  `Asia/Ho_Chi_Minh` và giữ bàn trong schema riêng. Mọi tài khoản dùng cùng bàn.
  Ngày công khai không phải seed có thể dùng để suy ra vị trí thẻ.
- Mỗi tài khoản có một phiên xếp hạng mỗi ngày. Tải lại tiếp tục cùng phiên;
  phiên đã hoàn thành không thể bắt đầu lại để cải thiện điểm trong ngày đó.
- Client chỉ gửi ID phiên và vị trí muốn mở. Server kiểm tra chủ sở hữu,
  tài khoản hoạt động, ngày, vị trí, thẻ đã ghép và thời gian khóa giữa lượt.
  Các cập nhật khóa hàng để tránh hai yêu cầu đồng thời.
- Thẻ chưa mở không được trả về client. Server tự đếm lượt, ghép cặp và tính
  thời gian liên tục từ lần mở đầu tiên đến khi hoàn thành, kể cả khi rời trang.
- Bảng xếp hạng lấy 20 phiên đã hoàn thành, theo lượt rồi thời gian. Chỉ trả
  biệt danh tự động, điểm và cờ `is_mine`; không trả email hoặc ID người khác.
- Kiểm tra phía server ngăn điểm/thời gian tự khai và mở thẻ không hợp lệ.
  Nó không cam kết ngăn mọi bot, chia sẻ vị trí hoặc sử dụng nhiều tài khoản.

## Kiểm tra

```sh
npm run test:memory
npm run test:memory:ui
npm run build
```

`test:memory` chạy logic/storage/ảnh và migration trên Postgres PGlite độc lập,
gồm chạy lại migration, quyền truy cập, cô lập tài khoản, xung đột phiên bản,
khóa lượt, không lộ thẻ và xác thực kết quả xếp hạng.
`test:memory:ui` render component thật trong jsdom, mock transport Supabase;
không sử dụng `.env`, gửi dữ liệu hoặc tạo người dùng trên dự án thật.

Kiểm tra trực quan bổ sung trên trình duyệt ở 320/390/768/1280 px, light/dark:
không cuộn ngang, thẻ chạm tối thiểu 44 px, bàn 4 cột trên điện thoại,
Tab/Shift+Tab/Enter/Space, Escape trong popup, focus khi tạm dừng và tiếp tục,
ảnh lỗi, mất mạng, chuyển tài khoản và phục hồi phiên thử thách.
