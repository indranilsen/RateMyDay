// Lightweight in-memory counters for HTTP responses. Used by the admin
// Health & Activity panel. Reset on process restart — for richer history
// we'd push these into a TSDB, but that's out of scope here.
const WINDOW_MS = 5 * 60 * 1000;

const stats = {
  total: 0,
  by2xx: 0,
  by3xx: 0,
  by4xx: 0,
  by5xx: 0,
  // recent: array of { t: epoch_ms, s: status_code } — kept for the last 5 minutes
  recent: []
};

// Express middleware: increment counters when each response finishes.
// Use res.on('finish') so we read the final statusCode after handlers run.
function middleware(req, res, next) {
  res.on('finish', () => {
    const code = res.statusCode;
    stats.total++;
    if (code < 300) stats.by2xx++;
    else if (code < 400) stats.by3xx++;
    else if (code < 500) stats.by4xx++;
    else stats.by5xx++;
    const now = Date.now();
    stats.recent.push({ t: now, s: code });
    // Trim entries older than the rolling window
    const cutoff = now - WINDOW_MS;
    while (stats.recent.length && stats.recent[0].t < cutoff) {
      stats.recent.shift();
    }
  });
  next();
}

// Snapshot tailored for the admin panel
function snapshot() {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  // Trim once on read in case there hasn't been a request for a while
  while (stats.recent.length && stats.recent[0].t < cutoff) {
    stats.recent.shift();
  }
  // Per-status counts within the window
  const recentByStatus = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  for (const entry of stats.recent) {
    if (entry.s < 300) recentByStatus['2xx']++;
    else if (entry.s < 400) recentByStatus['3xx']++;
    else if (entry.s < 500) recentByStatus['4xx']++;
    else recentByStatus['5xx']++;
  }
  return {
    total: stats.total,
    byStatus: {
      '2xx': stats.by2xx,
      '3xx': stats.by3xx,
      '4xx': stats.by4xx,
      '5xx': stats.by5xx
    },
    windowMs: WINDOW_MS,
    windowCount: stats.recent.length,
    windowByStatus: recentByStatus,
    rpm: (stats.recent.length / (WINDOW_MS / 60000))
  };
}

module.exports = { middleware, snapshot };
