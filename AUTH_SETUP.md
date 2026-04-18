# 🔐 Hướng dẫn thiết lập Authentication (Đăng nhập / Đăng ký)

## 📋 Tổng quan

Hệ thống xác thực được xây dựng với:
- **Backend:** Node.js + Express + MySQL + JWT + bcrypt
- **Frontend:** React + Bootstrap 5 + lucide-react

## 🔧 Cài đặt Dependencies

### Server
```bash
npm install jsonwebtoken
```

### Frontend
Các package sau đã có sẵn:
- `bootstrap` - Giao diện
- `lucide-react` - Icons
- `uuid` - Tạo ID duy nhất

## 🌍 Cấu hình Environment Variables

Tạo file `.env` hoặc cập nhật file hiện có với:

```
# Database
DATABASE_HOST=your_host
DATABASE_PORT=3306
DATABASE_NAME=your_db
DATABASE_USER=your_user
DATABASE_PASSWORD=your_password
DATABASE_SSL_CA=your_ssl_ca

# Authentication
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRES_IN=1h
```

## 📁 Cấu trúc File

```
server/
├── db.cjs                          # Kết nối database
├── config.cjs                      # Cấu hình (cập nhật)
├── models/
│   └── authModel.cjs              # Model chứa logic DB
├── controllers/
│   └── authController.cjs         # Controller xử lý request
├── routes/
│   └── authRoutes.cjs             # Routes definition
└── index.cjs                       # Server bootstrap (cập nhật)

src/
├── api/
│   ├── userService.js             # User API
│   └── authService.js             # Auth API (NEW)
└── components/
    ├── Header.jsx                 # Header (cập nhật)
    ├── AuthForm.jsx               # Login/Register Form (NEW)
    └── AuthModal.jsx              # Modal wrapper (NEW)
```

## 🚀 API Endpoints

### 1. POST /api/auth/register
**Đăng ký tài khoản mới**

Request:
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "password123",
  "full_name": "John Doe" // Optional
}
```

Response (Success):
```json
{
  "success": true,
  "message": "Đăng ký thành công.",
  "data": {
    "userId": "uuid-string",
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

Response (Error):
```json
{
  "success": false,
  "error": "Username hoặc email đã tồn tại."
}
```

---

### 2. POST /api/auth/login
**Đăng nhập tài khoản**

Request:
```json
{
  "username": "john_doe",
  "email": null,           // hoặc email nếu không có username
  "password": "password123"
}
```

Response (Success):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "userId": "uuid-string",
    "username": "john_doe",
    "email": "john@example.com",
    "role": "customer",
    "status": "active"
  }
}
```

Response (Error):
```json
{
  "success": false,
  "error": "Thông tin đăng nhập không hợp lệ."
}
```

---

## 🎨 Frontend Component

### Sử dụng AuthModal trong App

```jsx
import Header from './components/Header';

function App() {
  return (
    <div>
      <Header /> {/* AuthModal đã tích hợp trong Header */}
      {/* ... rest of your content */}
    </div>
  );
}
```

### Props của AuthForm (nếu dùng trực tiếp)

```jsx
<AuthForm 
  onSuccess={(userData) => console.log(userData)} // Callback khi login thành công
  onClose={() => closeModal()}                    // Callback để đóng modal
/>
```

---

## ✨ Tính năng Frontend

### AuthForm Component

- **Tabs chuyển đổi** giữa Đăng nhập và Đăng ký
- **Validation**:
  - Username: ≥ 3 ký tự
  - Email: định dạng hợp lệ
  - Password: ≥ 6 ký tự
  - Confirm Password: khớp với password

- **Icons từ lucide-react**:
  - `Eye / EyeOff` - Hiển thị/ẩn mật khẩu
  - `Mail` - Trường email
  - `Lock` - Trường mật khẩu
  - `User` - Trường username
  - `AlertCircle` - Hiển thị lỗi

- **Loading State**:
  - Button disabled khi đang submit
  - Spinner hiển thị trong button
  - Input fields disabled

- **Toast Notifications**:
  - Hiển thị thành công/lỗi tự động
  - Tự động ẩn sau 5 giây

### AuthModal Component

- **Quản lý Auth State** toàn cục
- **Hiển thị tình trạng**:
  - Chưa đăng nhập: nút "Đăng nhập / Đăng ký"
  - Đã đăng nhập: hiển thị username + nút "Đăng xuất"
- **Sync giữa tabs**: đăng xuất từ tab này sẽ sync tất cả tab khác

---

## 🔐 Lưu trữ Token

Token được lưu trong `localStorage`:

```javascript
// Lấy token
const token = localStorage.getItem('authToken');

// Lấy thông tin user
const user = JSON.parse(localStorage.getItem('user'));

// Kiểm tra đã đăng nhập
import { isAuthenticated } from '@/api/authService';
if (isAuthenticated()) { /* ... */ }
```

---

## 📊 Database Logging

Sau khi đăng nhập thành công, hệ thống tự động:
- Ghi log vào bảng `user_activities`
- Lưu lại `action: 'login'`
- Ghi IP address (từ `req.ip`)
- Ghi User-Agent (từ request header)

Query để xem logs:
```sql
SELECT * FROM user_activities 
WHERE action = 'login' 
ORDER BY created_at DESC;
```

---

## 🧪 Test API

### Postman / Thunder Client

**Register:**
```
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123",
  "full_name": "Test User"
}
```

**Login:**
```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "username": "testuser",
  "email": null,
  "password": "password123"
}
```

---

## 🚨 Xử lý lỗi

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-----------|----------|
| `Username hoặc email đã tồn tại` | User đã đăng ký | Sử dụng username/email khác |
| `Thông tin đăng nhập không hợp lệ` | Username/password sai | Kiểm tra lại thông tin |
| `Mật khẩu phải ít nhất 6 ký tự` | Password quá ngắn | Nhập mật khẩu dài hơn |
| `Email không hợp lệ` | Định dạng email sai | Nhập email theo format xxx@yyy.com |

---

## 🔄 Workflow Login

```
User nhập form → Validation → API Call → Server check → 
Compare password → Generate JWT → Save token (localStorage) → 
Log activity (user_activities) → Callback onSuccess → Close modal
```

---

## 📝 Ghi chú

- JWT token mặc định hết hạn sau **1 giờ** (configurable via `JWT_EXPIRES_IN`)
- Password được hash với `bcrypt` (salt rounds: 10)
- API không trả về password_hash, chỉ trả user data an toàn
- Dùng `POST` để đảm bảo credentials được gửi an toàn

---

## ✅ Checklist Setup

- [ ] Cài `npm install jsonwebtoken`
- [ ] Cập nhật `.env` với JWT_SECRET
- [ ] Kiểm tra database có bảng `users` và `user_activities`
- [ ] Start server: `npm run sv`
- [ ] Test API endpoints
- [ ] Kiểm tra localStorage lưu token
- [ ] Test logout và sync giữa tabs

---

## 📞 Support

Nếu có vấn đề, kiểm tra:
1. Server console có lỗi gì không
2. Network tab trên browser DevTools
3. localStorage có token không
4. Database connection có OK không
