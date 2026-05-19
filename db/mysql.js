// MySQL backend — production behavior. Used unless DB_BACKEND=sqlite.
const fs = require('fs');
const path = require('path');
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

async function initializeDatabase() {
  const ddl = fs.readFileSync(path.join(__dirname, 'schema.mysql.sql'), 'utf8');
  const statements = ddl.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await promisePool.query(stmt);
  }
  console.log('[DB:mysql] Schema initialized');
}

async function close() {
  await promisePool.end();
  if (sessionStore.close) await sessionStore.close();
}

// Dialect-specific helper — MySQL's YEAR() function
async function getAvailableYears(userId) {
  const [rows] = await promisePool.query(
    'SELECT DISTINCT YEAR(rating_date) AS year FROM ratings WHERE user_id = ? ORDER BY year DESC',
    [userId]
  );
  return rows.map(r => r.year);
}

// Snapshot of the connection pool's internal counters. Best-effort — the
// fields are mysql2-internal but stable enough to use for an admin readout.
function getPoolStats() {
  const all = (pool._allConnections && pool._allConnections.toArray) ? pool._allConnections.toArray() : (pool._allConnections || []);
  const free = (pool._freeConnections && pool._freeConnections.toArray) ? pool._freeConnections.toArray() : (pool._freeConnections || []);
  const queue = pool._connectionQueue || [];
  return {
    total: all.length,
    idle: free.length,
    active: all.length - free.length,
    queued: queue.length,
    limit: options.connectionLimit
  };
}

// Dialect-specific helper — MySQL JSON_EXTRACT boolean comparison
async function listReminderCandidates() {
  const [rows] = await promisePool.query(`
    SELECT u.id AS userId, u.email, s.data
    FROM users u
           JOIN settings s ON u.id = s.user_id
    WHERE JSON_EXTRACT(s.data, '$.sendReminders') = true
       OR JSON_UNQUOTE(JSON_EXTRACT(s.data, '$.sendReminders')) = 'true';
  `);
  return rows;
}

// Dialect-specific helper — selects users opted into the monthly recap.
// Mirrors listReminderCandidates but on a separate flag so users can want
// the recap without nightly reminders (or vice versa).
async function listMonthlyRecapCandidates() {
  const [rows] = await promisePool.query(`
    SELECT u.id AS userId, u.email, s.data
    FROM users u
           JOIN settings s ON u.id = s.user_id
    WHERE JSON_EXTRACT(s.data, '$.sendMonthlyRecap') = true
       OR JSON_UNQUOTE(JSON_EXTRACT(s.data, '$.sendMonthlyRecap')) = 'true';
  `);
  return rows;
}

module.exports = {
  db: promisePool,
  sessionStore,
  initializeDatabase,
  close,
  getAvailableYears,
  listReminderCandidates,
  listMonthlyRecapCandidates,
  getPoolStats
};
