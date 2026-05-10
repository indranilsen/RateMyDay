// Load environment variables in .env files
require('dotenv').config({
  path: process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev'
});

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cors = require('cors');
const session = require('express-session');

// Import your db and sessionStore from db.js
const { db, sessionStore } = require('./db');

const initializeDatabase = require('./init-db');

// Routers
const usersRouter = require('./routes/users');
const ratingsRouter = require('./routes/ratings');
const settingsRouter = require('./routes/settings');
const adminRouter = require('./routes/admin');

const app = express();
const port = process.env.PORT || 3001;

// Fail fast on missing required config — silent default-to-undefined for CORS_ORIGIN
// would let `cors` reflect any origin with credentials, which we never want.
if (!process.env.CORS_ORIGIN) {
  console.error('[Init] CORS_ORIGIN is not set. Refusing to start.');
  process.exit(1);
}

// Security headers (HSTS, X-Frame-Options, no-sniff, etc.) — nginx covers some
// of this in front, but belt-and-braces for the JSON API itself
app.use(helmet());

// Middleware for parsing request bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure morgan for logging
app.use(morgan('combined'));

// CORS Configuration
console.log("Allowing requests from origin: " + process.env.CORS_ORIGIN)
app.use(cors({
  origin: process.env.CORS_ORIGIN, // Allow requests from this origin
  credentials: true // Enable credentials for CORS requests
}));

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
  cookie: {
    secure: 'auto', // cookie is secure in HTTPS environments
    httpOnly: true,
    maxAge: 2 * 60 * 60 * 1000 // Sets the cookie expiration to 2 hours
  }
}));

// Health endpoint — checks DB reachability so nginx/uptime checks can tell
// "process alive but DB down" from "fully healthy"
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Health] DB check failed', err);
    res.status(503).json({ status: 'db_unavailable' });
  }
});

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
    console.log(`[Shutdown] Received ${signal}, closing gracefully`);
    server.close(async () => {
      console.log('[Shutdown] HTTP server closed');
      try {
        await Promise.allSettled([db.end(), sessionStore.close()]);
        console.log('[Shutdown] Cleanup done');
        process.exit(0);
      } catch (err) {
        console.error('[Shutdown] Error during cleanup', err);
        process.exit(1);
      }
    });
    // If something is stuck, force-exit after 10s so PM2 doesn't have to SIGKILL us
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
