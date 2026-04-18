const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { createConnection, parseJsonBody, json } = require('./utils/db.cjs');

const JWT_SECRET = process.env.JWT_SECRET || 'please-change-this-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  const body = parseJsonBody(event);
  if (!body) {
    return json(400, { success: false, error: 'Invalid JSON body' });
  }

  const { username, password } = body;
  if (!username || !password) {
    return json(400, { success: false, error: 'Username và password là bắt buộc.' });
  }

  const connection = await createConnection();
  try {
    const [users] = await connection.execute(
      'SELECT user_id, username, email, password_hash, status FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return json(401, { success: false, error: 'Username hoặc password không đúng.' });
    }

    const user = users[0];
    if (user.status !== 'active') {
      return json(403, { success: false, error: 'Tài khoản chưa được kích hoạt hoặc đã bị khóa.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return json(401, { success: false, error: 'Username hoặc password không đúng.' });
    }

    const token = jwt.sign({ userId: user.user_id, username: user.username }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    const activityId = uuidv4();
    await connection.execute(
      'INSERT INTO user_activities (activity_id, user_id, action, module, description) VALUES (?, ?, ?, ?, ?)',
      [activityId, user.user_id, 'login', 'auth', 'Đăng nhập thành công']
    );

    return json(200, {
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
    return json(500, { success: false, error: 'Lỗi server: ' + error.message });
  } finally {
    await connection.end();
  }
};