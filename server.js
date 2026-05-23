// Load environment variables in .env files
require('dotenv').config({
  path: process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev'
});

// SQLite mode is local-dev only — fill in sane defaults so the user can run
// `DB_BACKEND=sqlite npm start` without having to maintain a .env.dev file.
// Anything already set in the environment wins.
if (process.env.DB_BACKEND === 'sqlite') {
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'local-dev-secret-do-not-use-in-prod';
  process.env.DEV_MODE = process.env.DEV_MODE || 'true';
  process.env.DISABLE_REMINDERS = process.env.DISABLE_REMINDERS || 'true';
  process.env.ENDPOINT_PREFIX = process.env.ENDPOINT_PREFIX || '/';
}

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cors = require('cors');
const session = require('express-session');

// Import your db and sessionStore from db.js. The selector also exposes a
// backend-specific close() so we can shut down the right resources.
const { db, sessionStore, close: closeBackend } = require('./db');

const initializeDatabase = require('./init-db');
const requestStats = require('./request-stats');

// Routers
const usersRouter = require('./routes/users');
const ratingsRouter = require('./routes/ratings');
const settingsRouter = require('./routes/settings');
const adminRouter = require('./routes/admin');

const app = express();
const port = process.env.PORT || 3001;

// Trust the first hop (nginx) so req.ip and req.protocol reflect the real
// client, not the loopback. Without this the rate limiter would key every
// request to '::1' and treat all traffic as one bucket.
app.set('trust proxy', 1);

// Latched once SIGTERM/SIGINT arrives. The drain middleware below checks this
// on every request so we stop accepting work the instant shutdown begins,
// even on already-open keep-alive connections.
let shuttingDown = false;

// Fail fast on missing required config — silent default-to-undefined for CORS_ORIGIN
// would let `cors` reflect any origin with credentials, which we never want.
if (!process.env.CORS_ORIGIN) {
  console.error('[Init] CORS_ORIGIN is not set. Refusing to start.');
  process.exit(1);
}

// Security headers (HSTS, X-Frame-Options, no-sniff, etc.) — nginx covers some
// of this in front, but belt-and-braces for the JSON API itself
app.use(helmet());

// In-memory request counters consumed by the admin Health & Activity panel.
// Registered early so every response (including 404s) flows through the
// res.on('finish') hook.
app.use(requestStats.middleware);

// Drain — once shutdown is initiated, reject every new request with 503.
// Sits before body parsing so we fail fast and don't waste cycles parsing
// requests we're never going to serve. The Connection: close header asks
// the client to drop the keep-alive socket so the upstream stops reusing it.
app.use((req, res, next) => {
  if (shuttingDown) {
    res.set('Connection', 'close');
    return res.status(503).json({ message: 'Server is shutting down' });
  }
  next();
});

// Body parsing — JSON only. The app's API has zero form-encoded payloads;
// `bodyParser.urlencoded` was being attempted on every request just to no-op.
// `limit: 16kb` is well above our largest legitimate payload (a day note
// + rating + a few settings flags) and shrinks the attack surface.
app.use(bodyParser.json({ limit: '16kb' }));

// Configure morgan for logging
app.use(morgan('combined'));

// CORS Configuration
console.log("Allowing requests from origin: " + process.env.CORS_ORIGIN)
app.use(cors({
  origin: process.env.CORS_ORIGIN, // Allow requests from this origin
  credentials: true // Enable credentials for CORS requests
}));

// Health endpoint — checks DB reachability so nginx/uptime checks can tell
// "process alive but DB down" from "fully healthy". Deliberately mounted
// BEFORE the session middleware so frequent uptime probes don't hit the
// session store (which is itself a DB query on every request in MySQL mode).
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Health] DB check failed', err);
    res.status(503).json({ status: 'db_unavailable' });
  }
});

// Session configuration
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === '') {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.log('Creating new session secret')
}

app.use(session({
  secret: sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  // `rolling: true` refreshes the cookie expiration on every request so
  // an active user never gets kicked mid-edit. Without it (the default),
  // the expiration is stamped at login and the user is logged out exactly
  // `maxAge` later regardless of activity — symptom was: type a day note,
  // hit Save, get bounced to /login mid-write because the 2h ceiling hit.
  rolling: true,
  cookie: {
    secure: 'auto', // cookie is secure in HTTPS environments
    httpOnly: true,
    // 7 days — sleepy enough for a daily journaling cadence without
    // requiring monthly logins. The rolling refresh above means anyone
    // who opens the app at least once a week stays logged in indefinitely.
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// Use routers
let endpointPrefix = process.env.ENDPOINT_PREFIX;
console.log("Using endpoint prefix: " + endpointPrefix);
app.use(endpointPrefix + 'api/users', usersRouter);
app.use(endpointPrefix + 'api/ratings', ratingsRouter);
app.use(endpointPrefix + 'api/settings', settingsRouter);
app.use(endpointPrefix + 'api/admin', adminRouter);

// 404 handler — keeps unknown paths from leaking the default Express page
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Centralized error middleware — catches anything routes throw, plus body-parser
// JSON-parse errors from bot traffic (kept quiet, since they aren't real bugs)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    console.log('[Server] Rejected malformed JSON body from', req.ip);
    return res.status(400).json({ message: 'Malformed JSON body' });
  }
  console.error('[Server] Unhandled error', err);
  res.status(500).json({ message: 'Internal server error' });
});

// Process-level safety nets — log and exit so PM2 restarts deterministically
// rather than leaving the process in an undefined state.
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled promise rejection', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception', err);
  process.exit(1);
});

// Start the server only after the DB schema is ready
async function main() {
  await initializeDatabase();

  const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
  // Avoid the default 0 (no timeout) so a stuck client/SQL query can't pin a connection forever
  server.requestTimeout = 30000;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  const shutdown = (signal) => {
    // Idempotent: a second signal while we're already shutting down is the
    // operator telling us to stop being polite. Hard-exit instead of stacking
    // another server.close() handler (which is what caused the MaxListeners
    // warning we used to see).
    if (shuttingDown) {
      console.log(`[Shutdown] Received ${signal} again, forcing exit`);
      return process.exit(1);
    }
    shuttingDown = true;
    console.log(`[Shutdown] Received ${signal}, closing gracefully`);

    server.close(async () => {
      console.log('[Shutdown] HTTP server closed');
      try {
        // `closeBackend` is provided by both db backends (mysql pool.end /
        // sqlite db.close). sessionStore.close exists on express-mysql-session
        // but not on the built-in MemoryStore used in SQLite mode — guard it.
        const tasks = [];
        if (typeof closeBackend === 'function') tasks.push(closeBackend());
        if (sessionStore && typeof sessionStore.close === 'function') tasks.push(sessionStore.close());
        await Promise.allSettled(tasks);
        console.log('[Shutdown] Cleanup done');
        process.exit(0);
      } catch (err) {
        console.error('[Shutdown] Error during cleanup', err);
        process.exit(1);
      }
    });

    // server.close waits for every connection to close. Browsers holding a
    // keep-alive socket open will sit forever, so prod the idle ones to drop
    // after a 1s grace period — any in-flight request gets to finish first.
    setTimeout(() => {
      if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }
    }, 1000).unref();

    // Last-resort hard exit so PM2 doesn't have to SIGKILL us
    setTimeout(() => {
      console.error('[Shutdown] Forced exit after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  require('./reminder-task');
}

main().catch((err) => {
  console.error('[Server] Fatal error during startup', err);
  process.exit(1);
});
