const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const authRoutes = require('./routes/authRoutes.cjs');
const db = require('./db.cjs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);


// API: Lấy thông tin profile dựa trên user_id
app.get('/api/users/:user_id', (req, res) => {
    try {
        const { user_id } = req.params;

        // Validation UUID
        if (!user_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            return res.status(400).json({ 
                success: false, 
                error: 'ID người dùng không hợp lệ' 
            });
        }

        const sql = `SELECT user_id, username, email, full_name, role, status, created_at, updated_at 
                     FROM users WHERE user_id = ?`;
        
        db.query(sql, [user_id], (err, results) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Lỗi truy vấn: ' + err.message 
                });
            }

            if (results.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Không tìm thấy người dùng' 
                });
            }

            const user = results[0];

            // Ghi log hoạt động lấy profile
            const activityId = uuidv4();
            const sqlLog = `INSERT INTO user_activities (activity_id, user_id, action, module, description) 
                            VALUES (?, ?, ?, ?, ?)`;
            
            db.query(sqlLog, [
                activityId, 
                user_id, 
                'view_profile', 
                'user', 
                `Xem thông tin profile của ${user.username}`
            ], (err) => {
                if (err) {
                    console.error('Lỗi ghi log:', err);
                    // Không trả về lỗi, tiếp tục trả về thông tin user
                }
            });

            res.json({ 
                success: true, 
                data: user 
            });
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Lỗi server: ' + error.message 
        });
    }
});

// API: Cập nhật trạng thái status
app.put('/api/users/:user_id/status', (req, res) => {
    try {
        const { user_id } = req.params;
        const { status, ip_address, user_agent } = req.body;

        // Validation UUID
        if (!user_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            return res.status(400).json({ 
                success: false, 
                error: 'ID người dùng không hợp lệ' 
            });
        }

        // Validation status
        const validStatus = ['active', 'inactive', 'banned'];
        if (!status || !validStatus.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Trạng thái không hợp lệ. Phải là: active, inactive, hoặc banned' 
            });
        }

        const activityId = uuidv4();

        // Sử dụng Transaction
        db.beginTransaction(err => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Lỗi bắt đầu transaction: ' + err.message 
                });
            }

            // 1. Lấy thông tin user hiện tại
            const sqlGetUser = 'SELECT username, status FROM users WHERE user_id = ?';
            
            db.query(sqlGetUser, [user_id], (err, results) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).json({ 
                            success: false, 
                            error: 'Lỗi truy vấn: ' + err.message 
                        });
                    });
                }

                if (results.length === 0) {
                    return db.rollback(() => {
                        res.status(404).json({ 
                            success: false, 
                            error: 'Không tìm thấy người dùng' 
                        });
                    });
                }

                const oldStatus = results[0].status;
                const username = results[0].username;

                // 2. Cập nhật status
                const sqlUpdateStatus = 'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?';
                
                db.query(sqlUpdateStatus, [status, user_id], (err) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ 
                                success: false, 
                                error: 'Lỗi cập nhật: ' + err.message 
                            });
                        });
                    }

                    // 3. Ghi log hoạt động
                    const sqlLog = `INSERT INTO user_activities (activity_id, user_id, action, module, description, ip_address, user_agent) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?)`;
                    
                    db.query(sqlLog, [
                        activityId, 
                        user_id, 
                        'update_status', 
                        'user', 
                        `Cập nhật trạng thái từ "${oldStatus}" thành "${status}" cho người dùng ${username}`,
                        ip_address || null,
                        user_agent || null
                    ], (err) => {
                        if (err) {
                            return db.rollback(() => {
                                res.status(500).json({ 
                                    success: false, 
                                    error: 'Lỗi ghi log: ' + err.message 
                                });
                            });
                        }

                        db.commit(err => {
                            if (err) {
                                return db.rollback(() => {
                                    res.status(500).json({ 
                                        success: false, 
                                        error: 'Lỗi commit transaction: ' + err.message 
                                    });
                                });
                            }
                            res.json({ 
                                success: true, 
                                message: `Cập nhật trạng thái thành công từ "${oldStatus}" thành "${status}"`,
                                userId: user_id,
                                status: status
                            });
                        });
                    });
                });
            });
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Lỗi server: ' + error.message 
        });
    }
});

// API: Lấy danh sách hoạt động người dùng (với filter và pagination)
app.get('/api/activities', (req, res) => {
    try {
        const { module, username, limit = 50, offset = 0 } = req.query;

        let sql = `
            SELECT 
                ua.activity_id,
                ua.user_id,
                ua.action,
                ua.module,
                ua.description,
                ua.ip_address,
                ua.user_agent,
                ua.created_at,
                u.username,
                u.full_name,
                u.status,
                u.email
            FROM user_activities ua
            LEFT JOIN users u ON ua.user_id = u.user_id
            WHERE 1=1
        `;

        const params = [];

        // Filter by module
        if (module && module !== 'all') {
            sql += ' AND ua.module = ?';
            params.push(module);
        }

        // Filter by username
        if (username) {
            sql += ' AND u.username LIKE ?';
            params.push(`%${username}%`);
        }

        // Order by created_at DESC and apply pagination
        sql += ' ORDER BY ua.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        db.query(sql, params, (err, results) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Lỗi truy vấn: ' + err.message
                });
            }

            // Get total count for pagination
            let countSql = `
                SELECT COUNT(*) as total
                FROM user_activities ua
                LEFT JOIN users u ON ua.user_id = u.user_id
                WHERE 1=1
            `;

            const countParams = [];

            if (module && module !== 'all') {
                countSql += ' AND ua.module = ?';
                countParams.push(module);
            }

            if (username) {
                countSql += ' AND u.username LIKE ?';
                countParams.push(`%${username}%`);
            }

            db.query(countSql, countParams, (err, countResults) => {
                if (err) {
                    console.error('Lỗi count:', err);
                    // Tiếp tục trả về kết quả dù có lỗi count
                    return res.json({
                        success: true,
                        data: results,
                        pagination: {
                            limit: parseInt(limit),
                            offset: parseInt(offset),
                            total: results.length
                        }
                    });
                }

                res.json({
                    success: true,
                    data: results,
                    pagination: {
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        total: countResults[0].total
                    }
                });
            });
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Lỗi server: ' + error.message
        });
    }
});

// API: Lấy danh sách các modules để dropdown filter
app.get('/api/activities/modules', (req, res) => {
    try {
        const sql = `
            SELECT DISTINCT module 
            FROM user_activities 
            WHERE module IS NOT NULL
            ORDER BY module ASC
        `;

        db.query(sql, (err, results) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Lỗi truy vấn: ' + err.message
                });
            }

            res.json({
                success: true,
                data: results.map(row => row.module)
            });
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Lỗi server: ' + error.message
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại port ${PORT}`));