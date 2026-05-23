const os = require('os');
const disk = require('diskusage-ng');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const router = express.Router();
const { db, getPoolStats } = require('../db');
const { sendEmail } = require('../services/emailService');
const { sendRecapForUser } = require('../services/monthlyRecap');
const requestStats = require('../request-stats');

const execFileAsync = promisify(execFile);

// Static system facts that never change for the lifetime of the process.
// Computing them once at module load saves a sysctl/proc-read per /stats
// request (the admin panel polls this every 5s while open).
const CACHED_HOSTNAME = os.hostname();
const CACHED_CPU_COUNT = os.cpus().length;
const CACHED_NODE_VERSION = process.version;

// Cached disk-usage snapshot. The underlying statfs syscall isn't expensive
// per call but it dominates this endpoint's latency, and disk usage moves
// slowly enough that a 5s TTL is invisible to a human watching the panel.
let diskCache = { at: 0, value: null };
const DISK_TTL_MS = 5000;

// Cap for the ad-hoc email blaster; anything larger is almost certainly a mistake
const MAX_RECIPIENTS = 1000;
const EMAIL_BATCH_SIZE = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Middleware: Check if user is admin.
//
// Fast path: the session itself carries `userRole` (set at login). For
// authenticated admins this skips a DB roundtrip per admin request —
// which adds up because the admin UI polls /pm2/status and /health-metrics
// every few seconds.
//
// Slow path: a session created before we started storing `userRole` won't
// have it. Fall back to a DB lookup and patch it into the session for
// future requests on this session.
router.use(async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(403).json({ message: 'Not logged in' });
  }
  if (req.session.userRole === 'admin') {
    return next();
  }
  if (req.session.userRole && req.session.userRole !== 'admin') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  try {
    const [rows] = await db.query('SELECT user_role FROM users WHERE id=?', [req.session.userId]);
    if (!rows.length || rows[0].user_role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    req.session.userRole = rows[0].user_role;
    next();
  } catch (err) {
    console.error('Error checking admin role', err);
    next(err);
  }
});

/**
 * GET /api/admin/stats
 * Return system stats and user count
 */
router.get('/stats', async (req, res) => {
  try {
    // 1) CPU — raw numbers; the frontend turns them into bars/sparklines.
    // loadavg() is a cheap read; cpuCount is constant for the process.
    const load = os.loadavg();
    const cpuLoad = {
      l1: load[0],
      l5: load[1],
      l15: load[2],
      avg: (load[0] + load[1] + load[2]) / 3
    };

    // 2) Memory — both process RSS and system-wide so the page can show a real % bar
    const memProc = process.memoryUsage();
    const total = os.totalmem();
    const free = os.freemem();
    const memory = {
      rssBytes: memProc.rss,
      heapUsedBytes: memProc.heapUsed,
      heapTotalBytes: memProc.heapTotal,
      totalBytes: total,
      freeBytes: free,
      usedBytes: total - free
    };

    // 3) Disk — TTL-cached so the statfs syscall fires at most once every
    // few seconds even when the admin panel is polling at 1Hz.
    const now = Date.now();
    if (!diskCache.value || now - diskCache.at > DISK_TTL_MS) {
      try {
        const root = path.parse(process.cwd()).root;
        const info = await getDiskUsageAsync(root);
        diskCache = {
          at: now,
          value: { usedBytes: info.used, totalBytes: info.total, availableBytes: info.available }
        };
      } catch (err) {
        console.log('diskusage error:', err);
        diskCache = { at: now, value: null };
      }
    }

    // 4) User count + uptime
    const [userCountRows] = await db.query('SELECT COUNT(*) as count FROM users');
    const userCount = userCountRows[0].count;
    const uptimeSeconds = process.uptime();

    res.json({
      hostname: CACHED_HOSTNAME,
      nodeVersion: CACHED_NODE_VERSION,
      cpuCount: CACHED_CPU_COUNT,
      cpuLoad,
      memory,
      disk: diskCache.value,
      userCount,
      uptimeSeconds
    });
  } catch (err) {
    console.error('Error retrieving stats', err);
    res.status(500).json({ message: 'Error retrieving stats' });
  }
});

/**
 * GET /api/admin/users
 * Paginated + searchable user list. Query params:
 *   q       - optional search string (matches email / first_name / last_name)
 *   limit   - page size (default 10, max 100)
 *   offset  - skip count (default 0)
 * Response: { users, total, hasMore }
 */
router.get('/users', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    let limit = parseInt(req.query.limit, 10);
    let offset = parseInt(req.query.offset, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 10;
    if (limit > 100) limit = 100;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    // 1) Build the WHERE clause and shared param list. LOWER() on both sides
    // so LIKE works case-insensitively in both MySQL and SQLite.
    let where = '';
    const params = [];
    if (q.length > 0) {
      where = `WHERE LOWER(email) LIKE ? OR LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?`;
      const needle = `%${q.toLowerCase()}%`;
      params.push(needle, needle, needle);
    }

    // 2) Total count for the same filter
    const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM users ${where}`, params);
    const total = countRows[0].total;

    // 3) Page of rows
    const [rows] = await db.query(
      `SELECT id, email, first_name, last_name, user_role
       FROM users
       ${where}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      users: rows,
      total,
      hasMore: offset + rows.length < total
    });
  } catch (err) {
    console.error('Error retrieving user list', err);
    res.status(500).json({ message: 'Error retrieving user list' });
  }
});

/**
 * GET /api/admin/users/:id
 * Detail view + stats for a single user
 */
router.get('/users/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  try {
    // 1) Base user record
    const [users] = await db.query(
      'SELECT id, first_name, last_name, dob, email, user_role, created_at FROM users WHERE id = ?',
      [id]
    );
    if (!users.length) {
      return res.status(404).json({ message: 'User not found' });
    }
    const user = users[0];

    // 2) Stats: total rating count + most recent rating date
    const [statsRows] = await db.query(
      'SELECT COUNT(*) AS ratingCount, MAX(rating_date) AS lastRatingDate FROM ratings WHERE user_id = ?',
      [id]
    );
    const stats = statsRows[0] || { ratingCount: 0, lastRatingDate: null };

    res.json({
      ...user,
      ratingCount: stats.ratingCount,
      lastRatingDate: stats.lastRatingDate
    });
  } catch (err) {
    console.error('Error retrieving user detail', err);
    res.status(500).json({ message: 'Error retrieving user detail' });
  }
});

/**
 * POST /api/admin/users/bulk-delete
 * Body: { userIds: number[] }
 * Returns { deleted, skipped: [{id, reason}] }
 * Same guards as the single-delete: skip self, skip other admins. Capped to
 * 1000 ids per request so an accidental "select everyone" can't run forever.
 */
router.post('/users/bulk-delete', async (req, res) => {
  const { userIds } = req.body || {};
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: 'userIds[] required' });
  }
  if (userIds.length > 1000) {
    return res.status(400).json({ message: 'Too many ids (max 1000)' });
  }

  const skipped = [];
  let deleted = 0;
  for (const rawId of userIds) {
    const id = parseInt(rawId, 10);
    if (!Number.isFinite(id)) {
      skipped.push({ id: rawId, reason: 'invalid id' });
      continue;
    }
    if (id === req.session.userId) {
      skipped.push({ id, reason: 'self' });
      continue;
    }
    try {
      const [rows] = await db.query('SELECT id, user_role FROM users WHERE id = ?', [id]);
      if (!rows.length) {
        skipped.push({ id, reason: 'not found' });
        continue;
      }
      if (rows[0].user_role === 'admin') {
        skipped.push({ id, reason: 'admin' });
        continue;
      }
      await db.query('DELETE FROM users WHERE id = ?', [id]);
      deleted++;
    } catch (err) {
      console.error(`[Admin] bulk-delete failed for id=${id}`, err);
      skipped.push({ id, reason: 'error' });
    }
  }

  console.log(`[Admin] bulk-delete by admin id=${req.session.userId}: deleted=${deleted} skipped=${skipped.length}`);
  res.json({ deleted, skipped });
});

/**
 * Pull email + localTimezone for a single user. Used by the recap endpoints
 * to anchor "prior month" in the user's timezone, matching the cron behavior.
 * Returns null if the user doesn't exist. localTimezone falls back to UTC if
 * the user never visited Settings.
 */
async function loadUserForRecap(userId) {
  const [rows] = await db.query(
    `SELECT u.id, u.email, s.data
       FROM users u
       LEFT JOIN settings s ON s.user_id = u.id
       WHERE u.id = ?`,
    [userId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  let tz = 'UTC';
  if (row.data) {
    try {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (parsed && typeof parsed.localTimezone === 'string') tz = parsed.localTimezone;
    } catch (err) {
      // Bad settings JSON — fall back to UTC rather than failing the send
    }
  }
  return { id: row.id, email: row.email, localTimezone: tz };
}

/**
 * POST /api/admin/users/:id/send-recap
 * Ad-hoc admin trigger for the monthly recap email — does NOT check the
 * sendMonthlyRecap opt-in (admin is explicitly choosing to send). Computes
 * stats for the prior month in the user's local timezone. Skips if the user
 * has no email or no ratings in that window.
 */
router.post('/users/:id/send-recap', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
  try {
    const u = await loadUserForRecap(id);
    if (!u) return res.status(404).json({ message: 'User not found' });

    const result = await sendRecapForUser({ userId: u.id, email: u.email, localTimezone: u.localTimezone });
    if (result.sent) {
      console.log(`[Admin] Ad-hoc recap sent to ${u.email} (id=${id}, month=${result.month}) by admin id=${req.session.userId}`);
      return res.json({ sent: 1, skipped: [] });
    }
    return res.json({ sent: 0, skipped: [{ id, reason: result.reason }] });
  } catch (err) {
    console.error('[Admin] send-recap failed', err);
    res.status(500).json({ message: 'Error sending recap' });
  }
});

/**
 * POST /api/admin/users/bulk-send-recap
 * Body: { userIds: number[] }
 * Same shape as bulk-delete: returns { sent, skipped: [{id, reason}] }.
 * Skips: no email, no ratings in prior month, not found, error.
 */
router.post('/users/bulk-send-recap', async (req, res) => {
  const { userIds } = req.body || {};
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: 'userIds[] required' });
  }
  if (userIds.length > 1000) {
    return res.status(400).json({ message: 'Too many ids (max 1000)' });
  }

  const skipped = [];
  let sent = 0;
  for (const rawId of userIds) {
    const id = parseInt(rawId, 10);
    if (!Number.isFinite(id)) {
      skipped.push({ id: rawId, reason: 'invalid_id' });
      continue;
    }
    try {
      const u = await loadUserForRecap(id);
      if (!u) {
        skipped.push({ id, reason: 'not_found' });
        continue;
      }
      const result = await sendRecapForUser({ userId: u.id, email: u.email, localTimezone: u.localTimezone });
      if (result.sent) {
        sent += 1;
      } else {
        skipped.push({ id, reason: result.reason });
      }
    } catch (err) {
      console.error(`[Admin] bulk-send-recap failed for id=${id}`, err);
      skipped.push({ id, reason: 'error' });
    }
  }

  console.log(`[Admin] bulk-send-recap by admin id=${req.session.userId}: sent=${sent} skipped=${skipped.length}`);
  res.json({ sent, skipped });
});

/**
 * DELETE /api/admin/users/:id
 * Body: { confirmEmail }
 * Guards: refuses self-delete, refuses deleting another admin.
 * Cascades to ratings and settings via FK ON DELETE CASCADE.
 */
router.delete('/users/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
  const { confirmEmail } = req.body || {};
  if (!confirmEmail || typeof confirmEmail !== 'string') {
    return res.status(400).json({ message: 'confirmEmail is required' });
  }

  try {
    // 1) Look up target user
    const [users] = await db.query(
      'SELECT id, email, user_role FROM users WHERE id = ?',
      [id]
    );
    if (!users.length) {
      return res.status(404).json({ message: 'User not found' });
    }
    const target = users[0];

    // 2) Refuse self-delete — admin must keep at least themselves around.
    // Using 409 (not 403) so the axios interceptor doesn't log the admin out.
    if (target.id === req.session.userId) {
      return res.status(409).json({ message: 'Cannot delete your own account' });
    }

    // 3) Refuse deleting another admin (operator must drop role manually first)
    if (target.user_role === 'admin') {
      return res.status(409).json({ message: 'Cannot delete another admin user' });
    }

    // 4) Confirm-by-email gate
    if (target.email !== confirmEmail) {
      return res.status(400).json({ message: 'confirmEmail does not match the user' });
    }

    // 5) Delete. FK cascade clears ratings + settings rows.
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    console.log(`[Admin] User ${target.email} (id=${id}) deleted by admin id=${req.session.userId}`);
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting user', err);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

/**
 * POST /api/admin/send-emails
 * Send an ad-hoc email to all or a subset
 */
router.post('/send-emails', async (req, res) => {
  const { subject, body, recipientType, emails } = req.body;

  if (!subject || !body) {
    return res.status(400).json({ message: 'Subject and body are required' });
  }

  try {
    let recipients = [];

    if (recipientType === 'all') {
      // Retrieve all user emails
      const [rows] = await db.query('SELECT email FROM users');
      recipients = rows.map(r => r.email);
    } else if (recipientType === 'subset') {
      // Use provided emails array
      if (!emails || !Array.isArray(emails)) {
        return res.status(400).json({ message: 'No emails provided' });
      }
      recipients = emails;
    }

    // 1) Validate every address before we send anything
    const invalid = recipients.filter(e => typeof e !== 'string' || !EMAIL_REGEX.test(e));
    if (invalid.length > 0) {
      return res.status(400).json({ message: 'Invalid recipient email(s)', invalid });
    }

    // 2) Cap so an accidental "send to everyone forever" can't actually do it
    if (recipients.length > MAX_RECIPIENTS) {
      return res.status(400).json({ message: `Too many recipients (max ${MAX_RECIPIENTS})` });
    }

    // 3) Strip dangerous HTML — never trust admin input as raw mail body
    const cleanBody = sanitizeHtml(body);

    // 4) Send in parallel batches so the HTTP request doesn't block per-recipient
    const results = [];
    for (let i = 0; i < recipients.length; i += EMAIL_BATCH_SIZE) {
      const chunk = recipients.slice(i, i + EMAIL_BATCH_SIZE);
      const settled = await Promise.allSettled(chunk.map(email => sendEmail({
        to: email,
        subject,
        html: cleanBody
      })));
      results.push(...settled);
    }

    const failed = results.filter(r => r.status === 'rejected').length;
    const sent = results.length - failed;
    if (failed > 0) {
      console.error(`[Admin] send-emails: ${failed}/${results.length} failed`);
    }
    return res.status(200).json({ message: 'Emails sent', sent, failed });
  } catch (err) {
    console.error('Error sending emails', err);
    res.status(500).json({ message: 'Error sending emails' });
  }
});

const getDiskUsageAsync = (path) => {
  const disk = require('diskusage-ng');
  return new Promise((resolve, reject) => {
    disk(path, (err, usage) => {
      if (err) return reject(err);
      resolve(usage);
    });
  });
};

/**
 * GET /api/admin/health-metrics
 * Live counters for the admin Health & Activity panel.
 *   - request: in-process counters (total + last 5 min by status class)
 *   - pool: mysql2 pool stats (null in SQLite mode)
 *   - uptimeSeconds: how long this Node process has been alive
 */
router.get('/health-metrics', async (req, res) => {
  try {
    res.json({
      request: requestStats.snapshot(),
      pool: typeof getPoolStats === 'function' ? getPoolStats() : null,
      uptimeSeconds: process.uptime()
    });
  } catch (err) {
    console.error('Error retrieving health metrics', err);
    res.status(500).json({ message: 'Error retrieving health metrics' });
  }
});

/**
 * Resolve the running RateMyDay process record from `pm2 jlist`. Returns null
 * if PM2 isn't installed, isn't running, or doesn't know about us — callers
 * surface a 503 in those cases.
 */
async function getPm2App() {
  try {
    const { stdout } = await execFileAsync('pm2', ['jlist'], { timeout: 5000 });
    const list = JSON.parse(stdout);
    return list.find(a => a.name === 'RateMyDay') || null;
  } catch (err) {
    return null;
  }
}

/**
 * GET /api/admin/pm2/status
 * Returns a small snapshot of the PM2-managed app.
 */
router.get('/pm2/status', async (req, res) => {
  const app = await getPm2App();
  if (!app) {
    return res.status(503).json({ message: 'PM2 not available' });
  }
  res.json({
    name: app.name,
    status: app.pm2_env.status,
    restarts: app.pm2_env.restart_time,
    unstableRestarts: app.pm2_env.unstable_restarts,
    pmUptime: app.pm2_env.pm_uptime,
    pid: app.pid,
    memoryBytes: app.monit ? app.monit.memory : null,
    cpuPercent: app.monit ? app.monit.cpu : null,
    execMode: app.pm2_env.exec_mode,
    nodeVersion: app.pm2_env.node_version
  });
});

/**
 * GET /api/admin/pm2/logs?type=out|err&lines=N
 * Tails the most recent N lines from PM2's log file for the app. Log paths
 * are read from `pm2 jlist` so this works regardless of PM2 config.
 */
router.get('/pm2/logs', async (req, res) => {
  const type = req.query.type === 'err' ? 'err' : 'out';
  let lines = parseInt(req.query.lines, 10);
  if (!Number.isFinite(lines) || lines <= 0) lines = 100;
  if (lines > 500) lines = 500;

  const app = await getPm2App();
  if (!app) {
    return res.status(503).json({ message: 'PM2 not available' });
  }
  const logPath = type === 'err' ? app.pm2_env.pm_err_log_path : app.pm2_env.pm_out_log_path;
  if (!logPath) {
    return res.status(404).json({ message: `No ${type} log path configured` });
  }

  try {
    const { stdout } = await execFileAsync('tail', ['-n', String(lines), logPath], { timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
    res.json({ type, path: logPath, lines: stdout.split('\n') });
  } catch (err) {
    console.error('[Admin] pm2 logs failed', err);
    res.status(500).json({ message: 'Failed to read PM2 logs' });
  }
});

/**
 * POST /api/admin/pm2/restart
 * Triggers `pm2 reload` — graceful, picks up env changes. Responds first
 * because the current process is the one being replaced.
 */
router.post('/pm2/restart', async (req, res) => {
  const app = await getPm2App();
  if (!app) {
    return res.status(503).json({ message: 'PM2 not available' });
  }
  console.log(`[Admin] pm2 reload initiated by admin id=${req.session.userId}`);
  res.json({ message: 'Reload initiated' });
  // Give the response a moment to flush before PM2 swaps the process
  setTimeout(() => {
    execFile('pm2', ['reload', 'RateMyDay'], (err) => {
      if (err) console.error('[Admin] pm2 reload failed', err);
    });
  }, 200);
});

module.exports = router;
