# Vercel Deployment Guide

## Environment Variables

Trong Vercel dashboard, thêm các environment variables sau:

- `DATABASE_HOST`: Host của MySQL database
- `DATABASE_USER`: Username database
- `DATABASE_PASSWORD`: Password database
- `DATABASE_NAME`: Tên database
- `DATABASE_PORT`: Port database (mặc định 3306)
- `JWT_SECRET`: Secret key cho JWT
- `JWT_EXPIRES_IN`: Thời gian hết hạn JWT (mặc định 1h)

## API Endpoints

Sau khi deploy, các API sẽ có sẵn tại:

- POST `/api/auth/register` - Đăng ký
- POST `/api/auth/login` - Đăng nhập
- GET `/api/hello` - Test API
- GET `/api/users/[user_id]` - Lấy thông tin user
- PUT `/api/users/[user_id]/status` - Cập nhật trạng thái user

## Deploy Steps

1. Push code lên GitHub
2. Connect repository với Vercel
3. Cấu hình environment variables
4. Deploy

## Lưu ý

- Database cần phải accessible từ internet (không phải localhost)
- Sử dụng connection pooling nếu traffic cao
- Thêm rate limiting cho production