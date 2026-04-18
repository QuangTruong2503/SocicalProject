const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2/promise');
const config = require('../../config.cjs');

const JWT_SECRET = process.env.JWT_SECRET || config.auth?.jwtSecret || 'please-change-this-secret';

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
    const { username, email, password, full_name } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username, email và password là bắt buộc.'
      });
    }

    const connection = await mysql.createConnection(dbConfig);

    // Check existing user
    const [existing] = await connection.execute(
      'SELECT user_id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      await connection.end();
      return res.status(409).json({
        success: false,
        error: 'Username hoặc email đã tồn tại.'
      });
    }

    const userId = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);

    await connection.execute(
      'INSERT INTO users (user_id, username, email, password_hash, full_name) VALUES (?, ?, ?, ?, ?)',
      [userId, username, email, password_hash, full_name]
    );

    await connection.end();

    return res.status(201).json({
      success: true,
      message: 'Đăng ký thành công.',
      data: { userId, username, email }
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      error: 'Lỗi server: ' + error.message
    });
  }
}