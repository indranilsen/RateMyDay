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

// Trim `recent` to the rolling window. Previously this used Array.shift()
// in a loop — O(N) per shift because every shift memmoves the entire tail
// of the array. Replaced with a single splice() that removes the prefix
// in one shot. Cheap, allocation-free for the common case where 0 or 1
// entries fall out of the window per call.
function trimRecent(now) {
  const cutoff = now - WINDOW_MS;
  const recent = stats.recent;
  if (recent.length === 0 || recent[0].t >= cutoff) return;
  // Binary search for the first entry inside the window — recent is
  // append-only (monotonic in `t`) so this is O(log N) instead of the
  // O(N) it took to walk shifts.
  let lo = 0, hi = recent.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (recent[mid].t < cutoff) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) recent.splice(0, lo);
}

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
    trimRecent(now);
  });
  next();
}

// Snapshot tailored for the admin panel
function snapshot() {
  const now = Date.now();
  // Trim once on read in case there hasn't been a request for a while
  trimRecent(now);
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
