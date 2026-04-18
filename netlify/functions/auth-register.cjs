const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { createConnection, parseJsonBody, json } = require('./utils/db.cjs');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  const body = parseJsonBody(event);
  if (!body) {
    return json(400, { success: false, error: 'Invalid JSON body' });
  }

  const { username, email, password, full_name } = body;
  if (!username || !email || !password) {
    return json(400, {
      success: false,
      error: 'Username, email và password là bắt buộc.'
    });
  }

  const connection = await createConnection();
  try {
    const [existing] = await connection.execute(
      'SELECT user_id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      return json(409, { success: false, error: 'Username hoặc email đã tồn tại.' });
    }

    const userId = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);

    await connection.execute(
      'INSERT INTO users (user_id, username, email, password_hash, full_name) VALUES (?, ?, ?, ?, ?)',
      [userId, username, email, password_hash, full_name]
    );

    return json(201, {
      success: true,
      message: 'Đăng ký thành công.',
      data: { userId, username, email }
    });
  } catch (error) {
    console.error('Register error:', error);
    return json(500, { success: false, error: 'Lỗi server: ' + error.message });
  } finally {
    await connection.end();
  }
};