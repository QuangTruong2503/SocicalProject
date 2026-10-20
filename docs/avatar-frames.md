# Khung Avatar

Người dùng chọn khung trang trí cho avatar tại **Dashboard → Avatar**. Admin quản lý danh sách khung tại **/admin/avatar-frames**. Hỗ trợ khung tĩnh (SVG mẫu, PNG, WebP) và khung động (APNG, WebP động) có ảnh tĩnh dự phòng.

## Cài đặt trên Supabase

Cần chạy trước: `supabase_profiles_auth_sync.sql`, `supabase_admin_profiles_policies.sql` (cung cấp `is_admin()`, `is_active_user()`).

1. Chạy lần lượt trong SQL Editor (hoặc `npx supabase db push`). Cả hai file chạy lặp lại an toàn:
   1. `supabase/migrations/20261020090000_avatar_frames.sql`: danh mục, lựa chọn trên hồ sơ, RPC, bucket `avatar-frames`, 6 khung tĩnh mẫu.
   2. `supabase/migrations/20261021090000_avatar_frames_animated.sql`: cột khung động, bảng `avatar_frame_uploads`, RPC mới, giới hạn bucket 2 MB, 2 khung động mẫu.
2. Triển khai Edge Function kiểm tra file:

   ```bash
   npx supabase functions deploy avatar-frame-inspect
   ```

   Function dùng các biến môi trường Supabase tự cấp (`SUPABASE_URL`, khóa publishable/anon, khóa service role). Không cần thêm secret. Có thể đặt `ALLOWED_ORIGINS` (danh sách origin, cách nhau bằng dấu phẩy) để giới hạn CORS.
3. Kiểm tra:
   - `select id, frame_type, image_format, is_active from public.avatar_frames order by sort_order;` trả về 8 khung (6 tĩnh, 2 động).
   - Bucket `avatar-frames` là public, `file_size_limit` = 2097152, chỉ nhận `image/png` và `image/webp`.
   - Admin thêm thử một khung: file được tải lên, rồi hiện mục "Đã xác thực trên máy chủ".

Nếu chưa chạy migration thứ hai, người dùng vẫn chọn được các khung tĩnh. Nếu chưa triển khai function, admin không tải được khung mới; giao diện báo "Chưa triển khai Edge Function avatar-frame-inspect".

## Thiết kế

| Phần | Cách làm |
| --- | --- |
| Danh mục | `avatar_frames`: `id`, `name`, `image_source` (`builtin`/`storage`), `image_path`, `fallback_path`, `frame_type` (`static`/`animated`), `image_format` (`svg`/`png`/`apng`/`webp`), `width`, `height`, `file_size`, `frame_count`, `duration_ms`, `sort_order`, `is_active`, `created_at`, `updated_at`. |
| Ràng buộc | Khung động phải là APNG/WebP, 2–120 frame, chu kỳ 1–10 giây. Khung động chỉ bật được khi có `fallback_path`. Khung tĩnh không có ảnh dự phòng. Mỗi file chỉ thuộc một khung, dù là ảnh chính hay ảnh dự phòng. |
| Lựa chọn | `profiles.avatar_frame_id` → FK `on delete set null`. Người dùng đổi khung qua RPC `set_my_avatar_frame` (chỉ ghi cột này trên hồ sơ của chính họ, chỉ nhận khung đang bật). Trigger chặn gán khung đã tắt. |
| Metadata tin cậy | Admin tải file lên bucket → Edge Function `avatar-frame-inspect` đọc lại chính file trong Storage (bằng token của admin) và kiểm tra từng byte (`frameImage.js`). Kết quả được ghi vào `avatar_frame_uploads` qua `avatar_frame_record_upload()`, hàm mà chỉ service role được gọi. Dung lượng phải khớp với Storage. `admin_save_avatar_frame` chỉ nhận file đã được ghi nhận và chép metadata từ bảng này, bỏ qua mọi giá trị trình duyệt gửi lên. |
| Admin | RPC `admin_list_avatar_frames`, `admin_save_avatar_frame` (trả về `removed_paths`: các file không còn dùng), `admin_delete_avatar_frame` (trả về cả ảnh chính và ảnh dự phòng), `admin_reorder_avatar_frames`. |
| Storage | Chỉ admin tải lên. Chỉ xóa được file không còn khung nào dùng làm ảnh chính hay ảnh dự phòng. Không có quyền ghi đè. File bị function từ chối sẽ bị xóa ngay; file tải lên nhưng không lưu (thay ảnh, đóng form) được client xóa. |
| Bộ kiểm tra dùng chung | `supabase/functions/avatar-frame-inspect/frameImage.js` chứa giới hạn (`AVATAR_FRAME_LIMITS`), quy tắc hiển thị cho admin và bộ đọc byte. Function và trang admin import cùng file này. File nằm trong thư mục function vì bundler của Supabase chỉ đóng gói thư mục đó. |

## Quy tắc file (admin tải lên)

- PNG, WebP tĩnh, APNG, WebP động; có kênh alpha. Không nhận SVG, GIF, video. Định dạng được đọc từ byte, không dựa vào tên hay MIME. File hỏng (chunk thiếu, CRC sai, số frame không khớp) bị từ chối.
- Ảnh vuông 128–512px, tối đa 2 MB.
- Khung động: tối đa 120 frame, chu kỳ 1–10 giây, mỗi frame ít nhất 20 ms (thời gian ngắn hơn thì mỗi trình duyệt hiển thị một kiểu). APNG khai báo 1 frame được xem là PNG tĩnh.
- Tâm ảnh phải trong suốt; avatar chiếm khoảng 77% cạnh ảnh.
- Ảnh dự phòng: PNG/WebP tĩnh, cùng quy tắc kích thước. Trên Chromium, form tự tạo ảnh dự phòng từ frame có nhiều điểm ảnh hiện rõ nhất (`ImageDecoder`); trình duyệt khác dùng frame đầu. Admin xem trước và có thể thay bằng ảnh khác. Nếu không tạo được, admin tải ảnh dự phòng lên; trước khi có ảnh dự phòng, khung chỉ lưu được ở trạng thái tắt.
- Hệ thống **không** tự phát hiện hiệu ứng nhấp nháy. Admin cần tránh khung chớp sáng nhanh (quá 3 lần/giây).

## Hiển thị khung động

- Trình duyệt tự phát APNG/WebP; không dùng vòng lặp JavaScript hay canvas cho từng avatar.
- Ảnh dự phòng được dùng thay ảnh động khi: người dùng bật giảm chuyển động (`prefers-reduced-motion`, cập nhật trực tiếp khi đổi), tab bị ẩn, avatar ra khỏi màn hình, hoặc đang tạm dừng ở vùng xem trước. Cả trang chỉ dùng một listener cho mỗi loại sự kiện và một `IntersectionObserver` (`src/hooks/useFrameMotion.js`).
- Danh sách chọn khung và danh sách admin chỉ tải ảnh dự phòng. Ảnh động chỉ được tải ở vùng xem trước, header, Dashboard và ngăn chi tiết người dùng (ngăn này dùng ảnh tĩnh).
- Ảnh động lỗi thì dùng ảnh dự phòng; cả hai lỗi thì chỉ bỏ lớp khung, avatar vẫn hiển thị.

## Khung mẫu

`node scripts/generate-avatar-frames.mjs` tạo toàn bộ file trong `public/avatar-frames/` từ hình vẽ vector viết trong chính script (không dùng tài nguyên bên ngoài):

- 6 khung SVG tĩnh: chỉ cần Node.
- `orbit-glow.png` (APNG, 30 frame, 2,4 giây) và `twinkle-stars.webp` (WebP động, 24 frame, 2,4 giây), kèm `*-still.png`: cần `sharp` (`npm i --no-save sharp@0.34.5`). Script ghép APNG bằng zlib; WebP do libwebp của sharp mã hóa. Chuyển động chậm (khoảng 0,4 Hz), không nhấp nháy.

Khi tạo lại khung động, cập nhật dung lượng, số frame và chu kỳ trong phần seed của migration thứ hai. `tests/avatarFramesAnimatedDatabase.test.mjs` sẽ báo nếu các số này lệch so với file thật.

## Kiểm tra

```bash
npm run test:avatar-frames
```

Lệnh này chạy:

- migration trong PGlite: phân quyền, nâng cấp từ dữ liệu cũ, metadata tin cậy, ảnh dự phòng;
- handler của Edge Function với Supabase giả lập;
- bộ đọc byte APNG/WebP;
- UI bằng jsdom: picker, header, phát/tạm dừng, giảm chuyển động, tab ẩn, ngoài vùng nhìn, chuỗi lỗi ảnh, trang admin chạy cùng handler thật.
