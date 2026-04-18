const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const config = require('../../config.cjs');

const JWT_SECRET = process.env.JWT_SECRET || config.auth?.jwtSecret || 'please-change-this-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || config.auth?.jwtExpiresIn || '1h';

const dbConfig = {
  host: process.env.DATABASE_HOST || config.database?.host,
  user: process.env.DATABASE_USER || config.database?.user,
  password: process.env.DATABASE_PASSWORD || config.database?.password,
  database: process.env.DATABASE_NAME || config.database?.name,
  port: process.env.DATABASE_PORT || config.database?.port || 3306,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username và password là bắt buộc.'
      });
    }

    const connection = await mysql.createConnection(dbConfig);

    const [users] = await connection.execute(
      'SELECT user_id, username, email, password_hash, status FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      await connection.end();
      return res.status(401).json({
        success: false,
        error: 'Username hoặc password không đúng.'
      });
    }

    const user = users[0];

    if (user.status !== 'active') {
      await connection.end();
      return res.status(403).json({
        success: false,
        error: 'Tài khoản chưa được kích hoạt hoặc đã bị khóa.'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      await connection.end();
      return res.status(401).json({
        success: false,
        error: 'Username hoặc password không đúng.'
      });
    }

    const token = jwt.sign(
      { userId: user.user_id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Log activity
    const activityId = require('uuid').v4();
    await connection.execute(
      'INSERT INTO user_activities (activity_id, user_id, action, module, description) VALUES (?, ?, ?, ?, ?)',
      [activityId, user.user_id, 'login', 'auth', `Đăng nhập thành công`]
    );

    await connection.end();

    return res.json({
      success: true,
      message: 'Đăng nhập thành công.',
      data: {
        token,
        user: {
          userId: user.user_id,
          username: user.username,
          email: user.email
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Lỗi server: ' + error.message
    });
  }
}