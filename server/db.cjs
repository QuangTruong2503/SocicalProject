const mysql = require('mysql2');
const fs = require('fs');
const config = require('../config.cjs');

const db = mysql.createConnection({
    host: config.database.host,
    user: config.database.user,
    password: config.database.password,
    database: config.database.name,
    port: config.database.port,
    ssl: {
        ca: fs.readFileSync(__dirname + '/ca.pem') || config.database.ssl_ca,
        rejectUnauthorized: true
    }
});
db.connect(err => {
    if (err) {
        console.error('❌ Lỗi kết nối MySQL:', err.message);
    } else {    
        console.log('✅ Đã kết nối MySQL an toàn qua SSL!');
    }
});

module.exports = db;
module.exports.default = db;
