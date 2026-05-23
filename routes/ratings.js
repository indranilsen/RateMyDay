const express = require('express');
const router = express.Router();
const { db, getAvailableYears } = require('../db');

const { format } = require('date-fns');

// Utility function to format the rating_date
const formatRatingDate = (ratings) => {
    return ratings.map(rating => ({
      ...rating,
      rating_date: rating.rating_date.toISOString().split('T')[0] // Format to 'YYYY-MM-DD'
    }));
  };

// Submit rating endpoint
router.post('/submit-rating', async (req, res) => {
    const userId = req.session.userId;
    const { ratingDate, rating, note } = req.body || {};

    // PATCH-style semantics on the `note` field (RFC 7396 / JSON Merge Patch):
    //   - field absent from body  -> preserve existing note (no change)
    //   - field present (any value, including '') -> set to that value
    // This lets the email's one-click flow (which only conveys a rating)
    // change the rating without wiping a note the user has already written.
    // The day-rating page still always sends `note`, so explicit edits and
    // explicit clears keep working.
    const noteProvided = req.body !== null && typeof req.body === 'object' && Object.prototype.hasOwnProperty.call(req.body, 'note');

    // Basic validation
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
    if (!ratingDate || rating === undefined || rating < 1 || rating > 10) {
      return res.status(400).json({ message: 'Invalid rating data' });
    }

    try {
      // Check if a rating already exists for the given date
      const [existing] = await db.query('SELECT id FROM ratings WHERE user_id = ? AND rating_date = ?', [userId, ratingDate]);

      if (existing.length > 0) {
        if (noteProvided) {
          await db.query('UPDATE ratings SET rating = ?, note = ? WHERE id = ?', [rating, note, existing[0].id]);
        } else {
          // Only touch the rating column — leaves note exactly as it was.
          await db.query('UPDATE ratings SET rating = ? WHERE id = ?', [rating, existing[0].id]);
        }
        res.json({ message: 'Rating updated successfully' });
      } else {
        // Fresh row — if no note was provided, store NULL rather than the
        // string "undefined" the old code would have inserted on a missing field.
        await db.query(
          'INSERT INTO ratings (user_id, rating_date, rating, note) VALUES (?, ?, ?, ?)',
          [userId, ratingDate, rating, noteProvided ? note : null]
        );
        res.json({ message: 'Rating submitted successfully' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error submitting rating' });
    }
  });


// Endpoint to retrieve rating for a specific date
router.get('/submit-rating', async (req, res) => {
    const userId = req.session.userId;
    const { ratingDate } = req.query;
  
    // Basic validation
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
    if (!ratingDate) {
      return res.status(400).json({ message: 'No date provided' });
    }
  
    try {
      // Retrieve the rating for the given date and user
      const [ratings] = await db.query('SELECT rating, note FROM ratings WHERE user_id = ? AND rating_date = ?', [userId, ratingDate]);
  
      if (ratings.length > 0) {
        res.json(ratings[0]);
      } else {
        res.json({});
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error retrieving rating' });
    }
});
  

// Get month data endpoint
router.get('/month-data', async (req, res) => {
    const userId = req.session.userId;
    const { year, month } = req.query;
  
    // Basic validation
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
    if (!year || !month) {
      return res.status(400).json({ message: 'Year and month are required' });
    }
  
    try {
      // Calculate the start and end dates of the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
  
      // Retrieve all ratings for the given month and user
      const [ratings] = await db.query(
        'SELECT rating_date, rating, note FROM ratings WHERE user_id = ? AND rating_date BETWEEN ? AND ?',
        [userId, startDate, endDate]
      );
  
      res.json(formatRatingDate(ratings));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error retrieving monthly data' });
    }
  });

// Year data endpoint
router.get('/year-data', async (req, res) => {
    const userId = req.session.userId;
    const { year } = req.query;
  
    // Basic validation
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
    if (!year) {
      return res.status(400).json({ message: 'Year is required' });
    }
  
    try {
      // Calculate the start and end dates of the year
      const startDate = `${year}-01-01`; // January 1st of the year
      const endDate = `${year}-12-31`; // December 31st of the year
  
      // Retrieve all ratings for the given year and user
      const [ratings] = await db.query(
        'SELECT rating_date, rating FROM ratings WHERE user_id = ? AND rating_date BETWEEN ? AND ? ORDER BY rating_date ASC',
        [userId, startDate, endDate]
      );
  
      res.json(formatRatingDate(ratings));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error retrieving year data' });
    }
  });

// Streak endpoint — cheap, returns just current + longest. Used by the
// nav-bar StreakBadge so we don't pay the full insights computation on
// every page change.
router.get('/streak', async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
    try {
      // Pull ratings + the user's settings row in parallel — settings holds
      // the `lastSeenStreak` ack value used to drive the nav badge.
      const [[ratingRows], [settingsRows]] = await Promise.all([
        db.query('SELECT rating_date FROM ratings WHERE user_id = ? ORDER BY rating_date ASC', [userId]),
        db.query('SELECT data FROM settings WHERE user_id = ? LIMIT 1', [userId])
      ]);

      let acknowledged = 0;
      if (settingsRows.length > 0) {
        let parsed = settingsRows[0].data;
        if (typeof parsed === 'string') {
          try { parsed = JSON.parse(parsed); } catch (e) { parsed = {}; }
        }
        if (parsed && typeof parsed.lastSeenStreak === 'number') {
          acknowledged = parsed.lastSeenStreak;
        }
      }

      if (ratingRows.length === 0) {
        return res.json({ current: 0, longest: 0, acknowledged });
      }

      const MS_PER_DAY = 86400000;

      // Single pass: compute longest streak via epoch-day gap math and
      // populate a Set of epoch-day integers for the current-streak walk.
      // Previously this allocated N strings + 2N Date objects (each gap
      // computed `new Date(prev) - new Date(curr)` inside the loop).
      const haveEpochDay = new Set();
      let longest = 1;
      let run = 1;
      let prevEpochDay = null;
      for (let i = 0; i < ratingRows.length; i++) {
        const epochDay = Math.floor(ratingRows[i].rating_date.getTime() / MS_PER_DAY);
        haveEpochDay.add(epochDay);
        if (prevEpochDay !== null) {
          if (epochDay - prevEpochDay === 1) {
            run += 1;
            if (run > longest) longest = run;
          } else {
            run = 1;
          }
        }
        prevEpochDay = epochDay;
      }

      // Current — count back from today (or yesterday if today not rated yet
      // so we don't break the user's streak before they've had a chance to rate).
      // Walk integer epoch days instead of decrementing a Date + re-formatting.
      const todayEpochDay = Math.floor(Date.now() / MS_PER_DAY);
      let cursor = haveEpochDay.has(todayEpochDay) ? todayEpochDay : todayEpochDay - 1;
      let current = 0;
      while (haveEpochDay.has(cursor)) {
        current += 1;
        cursor -= 1;
      }

      res.json({ current, longest, acknowledged });
    } catch (err) {
      console.error('Error computing streak', err);
      res.status(500).json({ message: 'Error computing streak' });
    }
  });

// Acknowledge the current streak — clears the nav badge until the streak
// grows further (or resets and starts a new one). Caller passes the value
// they just saw so a stale client can't accidentally ack a higher value
// than what's actually current.
router.post('/streak/ack', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(403).json({ message: 'Not logged in' });
  }
  const seen = req.body && req.body.streak;
  if (typeof seen !== 'number' || !Number.isFinite(seen) || seen < 0) {
    return res.status(400).json({ message: 'streak must be a non-negative number' });
  }
  try {
    // Upsert: if there's no settings row yet, create one with just this key.
    // JSON_SET on a missing row would be a no-op, so we branch.
    const [existing] = await db.query('SELECT 1 FROM settings WHERE user_id = ? LIMIT 1', [userId]);
    if (existing.length > 0) {
      await db.query(
        `UPDATE settings SET data = JSON_SET(data, '$.lastSeenStreak', ?) WHERE user_id = ?`,
        [seen, userId]
      );
    } else {
      await db.query(
        'INSERT INTO settings (user_id, data) VALUES (?, ?)',
        [userId, JSON.stringify({ lastSeenStreak: seen })]
      );
    }
    res.status(204).end();
  } catch (err) {
    console.error('Error acking streak', err);
    res.status(500).json({ message: 'Error acknowledging streak' });
  }
});

// Insights endpoint — personal analytics dashboard data.
//
// Performance contract: a single linear pass over the ratings array
// computes total, sum, day-of-week sums/counts, longest streak (via gap
// math on integer epoch days), per-month sums/counts (into a Map), and
// a date->rating lookup map for the recent-30 strip. Previously this did
// 2 separate streak walks + 7 array filters + 12 filter passes (one per
// month) — O(N×12) on the monthly block. Now O(N) end-to-end.
router.get('/insights', async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }

    try {
      const [rows] = await db.query(
        'SELECT rating_date, rating FROM ratings WHERE user_id = ? ORDER BY rating_date ASC',
        [userId]
      );

      const totalRatings = rows.length;
      let sum = 0;
      let longestStreak = totalRatings > 0 ? 1 : 0;
      let runLength = totalRatings > 0 ? 1 : 0;
      let prevEpochDay = null;
      const dowSums = [0, 0, 0, 0, 0, 0, 0];
      const dowCounts = [0, 0, 0, 0, 0, 0, 0];
      const monthlyMap = new Map(); // 'YYYY-MM' -> { sum, count }
      const haveDate = new Map();   // 'YYYY-MM-DD' -> rating
      const dates = new Array(totalRatings);

      const MS_PER_DAY = 86400000;

      for (let i = 0; i < totalRatings; i++) {
        const r = rows[i];
        // Date columns come back as a JS Date (mysql2 native + sqlite shim).
        // Use the underlying timestamp directly rather than re-parsing a
        // string — saves Date.parse + toISOString allocations per row.
        const dateObj = r.rating_date;
        const epochDay = Math.floor(dateObj.getTime() / MS_PER_DAY);
        const ds = dateObj.toISOString().slice(0, 10);
        dates[i] = ds;
        const rating = r.rating;

        sum += rating;
        haveDate.set(ds, rating);

        // Day-of-week: getUTCDay() is Sun=0..Sat=6; reindex to Mon=0..Sun=6
        const dow = (dateObj.getUTCDay() + 6) % 7;
        dowSums[dow] += rating;
        dowCounts[dow] += 1;

        // Monthly bucket
        const monthKey = ds.slice(0, 7);
        const bucket = monthlyMap.get(monthKey);
        if (bucket) {
          bucket.sum += rating;
          bucket.count += 1;
        } else {
          monthlyMap.set(monthKey, { sum: rating, count: 1 });
        }

        // Longest-streak via epoch-day gap (no Date math, no string parse)
        if (prevEpochDay !== null) {
          if (epochDay - prevEpochDay === 1) {
            runLength += 1;
            if (runLength > longestStreak) longestStreak = runLength;
          } else {
            runLength = 1;
          }
        }
        prevEpochDay = epochDay;
      }

      const averageRating = totalRatings === 0 ? 0 : sum / totalRatings;

      // Current streak — count back from today (or yesterday if today isn't
      // rated yet) using the in-memory haveDate map.
      let currentStreak = 0;
      if (totalRatings > 0) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const startOffset = haveDate.has(today.toISOString().slice(0, 10)) ? 0 : 1;
        const cursor = new Date(today);
        cursor.setUTCDate(cursor.getUTCDate() - startOffset);
        while (haveDate.has(cursor.toISOString().slice(0, 10))) {
          currentStreak += 1;
          cursor.setUTCDate(cursor.getUTCDate() - 1);
        }
      }

      const dayOfWeekAverages = [
        { day: 'Mon', average: dowCounts[0] ? dowSums[0] / dowCounts[0] : null, count: dowCounts[0] },
        { day: 'Tue', average: dowCounts[1] ? dowSums[1] / dowCounts[1] : null, count: dowCounts[1] },
        { day: 'Wed', average: dowCounts[2] ? dowSums[2] / dowCounts[2] : null, count: dowCounts[2] },
        { day: 'Thu', average: dowCounts[3] ? dowSums[3] / dowCounts[3] : null, count: dowCounts[3] },
        { day: 'Fri', average: dowCounts[4] ? dowSums[4] / dowCounts[4] : null, count: dowCounts[4] },
        { day: 'Sat', average: dowCounts[5] ? dowSums[5] / dowCounts[5] : null, count: dowCounts[5] },
        { day: 'Sun', average: dowCounts[6] ? dowSums[6] / dowCounts[6] : null, count: dowCounts[6] }
      ];

      // Monthly averages — last 12 months, most-recent first. Pull from the
      // Map we built during the main pass (O(1) per month lookup).
      const monthlyAverages = [];
      const now = new Date();
      for (let i = 0; i < 12; i++) {
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const yyyy = monthStart.getUTCFullYear();
        const mm = String(monthStart.getUTCMonth() + 1).padStart(2, '0');
        const key = `${yyyy}-${mm}`;
        const bucket = monthlyMap.get(key);
        monthlyAverages.push({
          month: key,
          average: bucket ? bucket.sum / bucket.count : null,
          count: bucket ? bucket.count : 0
        });
      }

      // Recent trend — last 30 days, oldest-first.
      const recentTrend = [];
      const trendCursor = new Date();
      trendCursor.setUTCHours(0, 0, 0, 0);
      trendCursor.setUTCDate(trendCursor.getUTCDate() - 29);
      for (let i = 0; i < 30; i++) {
        const ds = trendCursor.toISOString().slice(0, 10);
        recentTrend.push({ date: ds, rating: haveDate.has(ds) ? haveDate.get(ds) : null });
        trendCursor.setUTCDate(trendCursor.getUTCDate() + 1);
      }

      res.json({
        totalRatings,
        averageRating,
        currentStreak,
        longestStreak,
        dayOfWeekAverages,
        monthlyAverages,
        recentTrend
      });
    } catch (error) {
      console.error('Error retrieving insights', error);
      res.status(500).json({ message: 'Error retrieving insights' });
    }
  });

// Available years endpoint
router.get('/available-years', async (req, res) => {
    const userId = req.session.userId;
  
    // Basic validation
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
  
    try {
      // Dialect-specific (MySQL YEAR() vs SQLite strftime) — delegated to the backend
      const years = await getAvailableYears(userId);
      res.json(years);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error retrieving available years' });
    }
  });

// Export the router
module.exports = router;
