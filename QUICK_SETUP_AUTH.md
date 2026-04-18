# 🚀 Quick Setup - Authentication

## 1️⃣ Cài đặt Dependencies

```bash
npm install
```

## 2️⃣ Cấu hình Environment

Sao chép `.env.example` thành `.env` và cập nhật:

```bash
cp .env.example .env
```

Chỉnh sửa `.env`:
```
DATABASE_HOST=your_host
DATABASE_PORT=3306
DATABASE_NAME=your_db
DATABASE_USER=your_user
DATABASE_PASSWORD=your_pass
DATABASE_SSL_CA=/path/to/ca.pem

JWT_SECRET=change-this-to-random-string-12345
JWT_EXPIRES_IN=1h

PORT=5000
```

## 3️⃣ Kiểm tra Database

Đảm bảo có bảng:
- `users` - lưu tài khoản người dùng
- `user_activities` - ghi log hoạt động

```sql
-- Kiểm tra bảng users
DESCRIBE users;

-- Kiểm tra bảng user_activities
DESCRIBE user_activities;
```

## 4️⃣ Chạy Server

```bash
npm run sv
```

Output:
```
✅ Đã kết nối MySQL an toàn qua SSL!
🚀 Server đang chạy tại port 5000
```

## 5️⃣ Chạy Frontend

```bash
npm run dev
```

Mở browser: `http://localhost:5173`

## ✨ Tính năng mới

### Frontend
- ✅ AuthModal component trong Header
- ✅ AuthForm với tabs (Đăng nhập / Đăng ký)
- ✅ Validation form real-time
- ✅ Icons từ lucide-react
- ✅ Toast notifications
- ✅ Loading spinner khi submit
- ✅ Lưu token vào localStorage

### Backend
- ✅ JWT token generation
- ✅ bcrypt password hashing
- ✅ Automatic login logging
- ✅ Error handling

---

## 🧪 Test ngay

### Đăng ký
1. Click nút "Đăng nhập / Đăng ký" ở Header
2. Chọn tab "Đăng ký"
3. Nhập thông tin:
   - Username: `testuser`
   - Email: `test@example.com`
   - Password: `password123`
4. Click "Đăng ký"

### Đăng nhập
1. Chọn tab "Đăng nhập"
2. Nhập username/email: `testuser`
3. Nhập password: `password123`
4. Click "Đăng nhập"

---

## 🔒 Bảo mật

- Password được hash với bcrypt (10 salt rounds)
- JWT token hết hạn sau 1 giờ (configurable)
- Token lưu trong localStorage (có thể upgrade sang HttpOnly cookie)
- Login được log tự động vào database

---

## 📖 Tài liệu chi tiết

Xem [AUTH_SETUP.md](AUTH_SETUP.md) để hiểu rõ hơn:
- API endpoints chi tiết
- Request/Response format
- Component props
- Error handling
- Workflow diagram

---

## 🐛 Troubleshooting

| Vấn đề | Giải pháp |
|--------|----------|
| "CORS error" | Kiểm tra `cors()` middleware đã bật |
| "Cannot find module" | Chạy `npm install` |
| "Connection refused" | Kiểm tra server đang chạy port 5000 |
| "Password không khớp" | Kiểm tra bcrypt config, salt rounds = 10 |
| "Toast không hiển thị" | Kiểm tra Bootstrap CSS đã import |

---

## 📝 File mới tạo

```
✨ Tạo mới:
├── server/db.cjs
├── server/models/authModel.cjs
├── server/controllers/authController.cjs
├── server/routes/authRoutes.cjs
├── src/api/authService.js
├── src/components/AuthForm.jsx
├── src/components/AuthModal.jsx
├── AUTH_SETUP.md
├── .env.example
└── QUICK_SETUP_AUTH.md

🔄 Cập nhật:
├── server/index.cjs
├── config.cjs
├── package.json
└── src/components/Header.jsx
```

---

## ✅ Checklist

- [ ] npm install
- [ ] Copy .env.example → .env
- [ ] Cập nhật .env với DB credentials
- [ ] Kiểm tra database có bảng users, user_activities
- [ ] npm run sv (chạy server)
- [ ] npm run dev (chạy frontend)
- [ ] Test Đăng ký → thành công
- [ ] Test Đăng nhập → thành công
- [ ] Kiểm tra localStorage có token
- [ ] Kiểm tra database có log trong user_activities
