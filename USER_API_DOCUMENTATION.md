# User API Module Documentation

## Tổng Quan

Mô-đun API User cung cấp các endpoint để quản lý người dùng, bao gồm:
- ✅ Đăng ký tài khoản (mã hóa password bằng bcrypt)
- ✅ Lấy thông tin profile dựa trên user_id (UUID)
- ✅ Cập nhật trạng thái status
- ✅ Tự động ghi log lại hoạt động vào bảng user_activities

---

## 1. Đăng Ký Tài Khoản (Register)

### Endpoint
```
POST /api/register
```

### Request Body
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "full_name": "John Doe"
}
```

**Lưu ý:** Các trường `ip_address` và `user_agent` sẽ được tự động thêm từ client-side.

### Response (Success - 201)
```json
{
  "success": true,
  "message": "Đăng ký thành công",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "username": "john_doe",
  "email": "john@example.com"
}
```

### Response (Error - 400)
```json
{
  "success": false,
  "error": "Username, email, và password là bắt buộc"
}
```

### Response (Error - 409)
```json
{
  "success": false,
  "error": "Username hoặc email đã tồn tại"
}
```

### Tính Năng:
- ✅ Mã hóa password với bcrypt (10 salt rounds)
- ✅ Tạo UUID cho user_id
- ✅ Ghi nhận hoạt động "register" vào user_activities
- ✅ Sử dụng Transaction để đảm bảo tính toàn vẹn dữ liệu
- ✅ Trạng thái mặc định: 'active'
- ✅ Role mặc định: 'customer'

### Frontend Example (React)
```javascript
import { registerUser } from '@/api/userService';

const handleRegister = async () => {
  try {
    const response = await registerUser({
      username: 'john_doe',
      email: 'john@example.com',
      password: 'securePassword123',
      full_name: 'John Doe'
    });
    
    console.log('Đăng ký thành công:', response.userId);
  } catch (error) {
    console.error('Lỗi:', error.message);
  }
};
```

---

## 2. Lấy Thông Tin Profile

### Endpoint
```
GET /api/users/{user_id}
```

### Parameters
- `user_id` (required): UUID của người dùng

### Response (Success - 200)
```json
{
  "success": true,
  "data": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john_doe",
    "email": "john@example.com",
    "full_name": "John Doe",
    "role": "customer",
    "status": "active",
    "created_at": "2024-04-17 10:30:00",
    "updated_at": "2024-04-17 10:30:00"
  }
}
```

**Lưu ý:** Password hash KHÔNG được trả về vì lý do bảo mật.

### Response (Error - 404)
```json
{
  "success": false,
  "error": "Không tìm thấy người dùng"
}
```

### Response (Error - 400)
```json
{
  "success": false,
  "error": "ID người dùng không hợp lệ"
}
```

### Tính Năng:
- ✅ Validation UUID format
- ✅ Tự động ghi log hoạt động "view_profile"
- ✅ Không trả về password hash

### Frontend Example (React)
```javascript
import { getUserProfile } from '@/api/userService';

const handleGetProfile = async (userId) => {
  try {
    const response = await getUserProfile(userId);
    console.log('Thông tin profile:', response.data);
  } catch (error) {
    console.error('Lỗi:', error.message);
  }
};
```

---

## 3. Cập Nhật Trạng Thái (Update Status)

### Endpoint
```
PUT /api/users/{user_id}/status
```

### Parameters
- `user_id` (required): UUID của người dùng

### Request Body
```json
{
  "status": "banned"
}
```

**Giá trị hợp lệ cho status:**
- `active` - Người dùng hoạt động
- `inactive` - Người dùng không hoạt động
- `banned` - Người dùng bị cấm

### Response (Success - 200)
```json
{
  "success": true,
  "message": "Cập nhật trạng thái thành công từ \"active\" thành \"banned\"",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "banned"
}
```

### Response (Error - 400)
```json
{
  "success": false,
  "error": "Trạng thái không hợp lệ. Phải là: active, inactive, hoặc banned"
}
```

### Response (Error - 404)
```json
{
  "success": false,
  "error": "Không tìm thấy người dùng"
}
```

### Tính Năng:
- ✅ Validation UUID format
- ✅ Validation giá trị status
- ✅ Ghi log hoạt động "update_status" với trạng thái cũ và mới
- ✅ Cập nhật timestamp "updated_at"
- ✅ Sử dụng Transaction

### Frontend Example (React)
```javascript
import { updateUserStatus } from '@/api/userService';

const handleBanUser = async (userId) => {
  try {
    const response = await updateUserStatus(userId, 'banned');
    console.log('Cập nhật thành công:', response.message);
  } catch (error) {
    console.error('Lỗi:', error.message);
  }
};
```

---

## Activity Logging

Tất cả các API endpoint đều tự động ghi log hoạt động vào bảng `user_activities`:

### Log Records Created:

**1. Register Activity**
```sql
{
  activity_id: UUID,
  user_id: UUID,
  action: 'register',
  module: 'auth',
  description: 'Người dùng john_doe đăng ký tài khoản mới',
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0...',
  created_at: CURRENT_TIMESTAMP
}
```

**2. View Profile Activity**
```sql
{
  activity_id: UUID,
  user_id: UUID,
  action: 'view_profile',
  module: 'user',
  description: 'Xem thông tin profile của john_doe',
  ip_address: null,
  user_agent: null,
  created_at: CURRENT_TIMESTAMP
}
```

**3. Update Status Activity**
```sql
{
  activity_id: UUID,
  user_id: UUID,
  action: 'update_status',
  module: 'user',
  description: 'Cập nhật trạng thái từ "active" thành "banned" cho người dùng john_doe',
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0...',
  created_at: CURRENT_TIMESTAMP
}
```

---

## Security Features

### 1. Password Hashing
- ✅ Sử dụng bcrypt với 10 salt rounds
- ✅ Password KHÔNG bao giờ được lưu dưới dạng plain text
- ✅ Password KHÔNG bao giờ được trả về trong response

### 2. Data Validation
- ✅ UUID format validation
- ✅ Required field validation
- ✅ Enum validation for status

### 3. Database Transactions
- ✅ Đảm bảo consistency giữa users và user_activities
- ✅ Rollback tự động khi có lỗi

### 4. Duplicate Prevention
- ✅ UNIQUE constraint trên username và email
- ✅ Proper error messages cho duplicate entries

### 5. Client Info Tracking
- ✅ IP address capture (từ ipify.org API)
- ✅ User-agent tracking
- ✅ Timestamp tracking

---

## Error Handling

### HTTP Status Codes:
- **200 OK**: Yêu cầu thành công
- **201 Created**: Tài khoản đã được tạo thành công
- **400 Bad Request**: Input validation error
- **404 Not Found**: Người dùng không tồn tại
- **409 Conflict**: Duplicate username/email
- **500 Internal Server Error**: Lỗi server

### Error Response Format:
```json
{
  "success": false,
  "error": "Thông báo lỗi chi tiết"
}
```

---

## Usage Example - Complete Flow

```javascript
// 1. Đăng ký người dùng mới
const registerResponse = await registerUser({
  username: 'alice_smith',
  email: 'alice@example.com',
  password: 'MySecurePassword2024',
  full_name: 'Alice Smith'
});

const userId = registerResponse.userId;

// 2. Lấy thông tin profile
const profile = await getUserProfile(userId);
console.log('User:', profile.data);

// 3. Cập nhật trạng thái
const updateResponse = await updateUserStatus(userId, 'inactive');
console.log('Status updated:', updateResponse.message);

// 4. Kiểm tra profile cập nhật
const updatedProfile = await getUserProfile(userId);
console.log('Updated status:', updatedProfile.data.status);
```

---

## Testing with cURL

### Register
```bash
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "testPassword123",
    "full_name": "Test User"
  }'
```

### Get Profile
```bash
curl -X GET http://localhost:5000/api/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json"
```

### Update Status
```bash
curl -X PUT http://localhost:5000/api/users/550e8400-e29b-41d4-a716-446655440000/status \
  -H "Content-Type: application/json" \
  -d '{"status": "banned"}'
```

---

## Required Dependencies

```json
{
  "dependencies": {
    "express": "^5.2.1",
    "mysql2": "^3.22.1",
    "bcrypt": "^5.1.1",
    "uuid": "^13.0.0",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2"
  }
}
```

---

## Environment Variables Required

```bash
DATABASE_HOST=your-database-host
DATABASE_PORT=3306
DATABASE_NAME=your-database-name
DATABASE_USER=your-database-user
DATABASE_PASSWORD=your-database-password
DATABASE_SSL_CA=your-ssl-certificate

PORT=5000
```

---

## Notes

- Tất cả IDs (user_id, activity_id) được tạo tự động bằng UUID v4
- Timestamps được quản lý tự động bởi MySQL
- Transactions đảm bảo không có orphaned records
- Log entries cho phép audit trail cho tất cả hoạt động người dùng
