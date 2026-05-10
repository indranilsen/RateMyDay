const mysql = require('mysql2');
const session = require('express-session');
const mysqlSession = require('express-mysql-session')(session);

const options = {
    host: 'localhost',
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'RateMyDay',
    connectionLimit: 10,
    waitForConnections: true,
    connectTimeout: 10000
};

const pool = mysql.createPool(options);
// Defensive: log pool-level errors so a transient driver hiccup doesn't crash the process
pool.on('error', (err) => {
  console.error('[DB] Pool error', err);
});
const promisePool = pool.promise();

// Create a session store using the MySQL connection.
// clearExpired + expiration are aligned with the 2h cookie maxAge so the
// `sessions` table doesn't accumulate stale rows.
const sessionStore = new mysqlSession({
    ...options,
    clearExpired: true,
    expiration: 2 * 60 * 60 * 1000
});

module.exports = { db: promisePool, sessionStore };
