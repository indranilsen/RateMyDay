// SQLite backend — in-process, no external service. Used when DB_BACKEND=sqlite.
// Wraps better-sqlite3 in a mysql2-pool-compatible facade so route code stays unchanged.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const session = require('express-session');
const { seed } = require('./seed');

const sqliteDb = new Database(':memory:');
sqliteDb.pragma('foreign_keys = ON');
sqliteDb.pragma('journal_mode = MEMORY');

// Normalize a row to match mysql2's behavior:
//   - DATE columns (TEXT 'YYYY-MM-DD' in SQLite) -> JS Date object
//   - JSON column `data` (TEXT in SQLite) -> parsed object
// We only convert columns we know about; everything else passes through.
function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (val == null) continue;
    if (key.endsWith('_date') && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      row[key] = new Date(val);
    } else if (key === 'data' && typeof val === 'string') {
      try { row[key] = JSON.parse(val); } catch (err) { /* leave raw on bad JSON */ }
    }
  }
  return row;
}

// Coerce param values so better-sqlite3 accepts them.
// mysql2 silently accepts undefined and Date; better-sqlite3 throws on both.
function coerceParams(params) {
  const arr = Array.isArray(params) ? params : (params == null ? [] : [params]);
  return arr.map((v) => {
    if (v === undefined) return null;
    if (v instanceof Date) return v.toISOString().split('T')[0];
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
}

// Prepared-statement cache keyed by the raw SQL text. better-sqlite3's
// .prepare() compiles a fresh statement each call (cheap but not free —
// strings allocate, AST walks). Caching cuts steady-state query overhead
// dramatically for endpoints that re-execute the same SQL in a hot loop.
// Cap is generous; route SQL is small and static.
const STMT_CACHE = new Map();
const STMT_CACHE_MAX = 512;
function prepareCached(sql) {
  let stmt = STMT_CACHE.get(sql);
  if (stmt) return stmt;
  stmt = sqliteDb.prepare(sql);
  if (STMT_CACHE.size >= STMT_CACHE_MAX) {
    // Drop the oldest entry; rough LRU is fine — eviction is exceptional.
    const first = STMT_CACHE.keys().next().value;
    STMT_CACHE.delete(first);
  }
  STMT_CACHE.set(sql, stmt);
  return stmt;
}

// mysql2-compatible query() — returns Promise<[rows, fields]> on SELECT,
// Promise<[{ affectedRows, insertId }, fields]> on writes.
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const stmt = prepareCached(sql);
      const args = coerceParams(params);
      const trimmed = sql.trimStart().toUpperCase();

      if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
        const rows = stmt.all(...args).map(normalizeRow);
        resolve([rows, []]);
      } else {
        const info = stmt.run(...args);
        resolve([{
          affectedRows: info.changes,
          insertId: Number(info.lastInsertRowid),
          changedRows: info.changes
        }, []]);
      }
    } catch (err) {
      reject(err);
    }
  });
}

const db = { query };

// Session store: built-in MemoryStore. Dev-only — logs a benign warning we can ignore.
const sessionStore = new session.MemoryStore();

async function initializeDatabase() {
  const ddl = fs.readFileSync(path.join(__dirname, 'schema.sqlite.sql'), 'utf8');
  sqliteDb.exec(ddl);
  console.log('[DB:sqlite] Schema initialized');
  await seed(db);
}

async function close() {
  sqliteDb.close();
}

// Dialect-specific helper — SQLite has strftime, not YEAR()
async function getAvailableYears(userId) {
  const [rows] = await query(
    `SELECT DISTINCT CAST(strftime('%Y', rating_date) AS INTEGER) AS year
     FROM ratings WHERE user_id = ? ORDER BY year DESC`,
    [userId]
  );
  return rows.map(r => r.year);
}

// Dialect-specific helper — SQLite stores booleans as 0/1
async function listReminderCandidates() {
  const [rows] = await query(`
    SELECT u.id AS userId, u.email, s.data
    FROM users u
           JOIN settings s ON u.id = s.user_id
    WHERE json_extract(s.data, '$.sendReminders') = 1
       OR json_extract(s.data, '$.sendReminders') = 'true';
  `);
  return rows;
}

// SQLite is a single in-process connection, so the pool concept doesn't apply.
// Returning null tells the admin UI to render a "single connection" hint.
function getPoolStats() {
  return null;
}

// Dialect-specific helper — SQLite stores booleans as 0/1
async function listMonthlyRecapCandidates() {
  const [rows] = await query(`
    SELECT u.id AS userId, u.email, s.data
    FROM users u
           JOIN settings s ON u.id = s.user_id
    WHERE json_extract(s.data, '$.sendMonthlyRecap') = 1
       OR json_extract(s.data, '$.sendMonthlyRecap') = 'true';
  `);
  return rows;
}

module.exports = {
  db,
  sessionStore,
  initializeDatabase,
  close,
  getAvailableYears,
  listReminderCandidates,
  listMonthlyRecapCandidates,
  getPoolStats
};
