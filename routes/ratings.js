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
    const { ratingDate, rating, note } = req.body;
  
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
        // Update the existing rating
        await db.query('UPDATE ratings SET rating = ?, note = ? WHERE id = ?', [rating, note, existing[0].id]);
        res.json({ message: 'Rating updated successfully' });
      } else {
        // Insert a new rating
        await db.query('INSERT INTO ratings (user_id, rating_date, rating, note) VALUES (?, ?, ?, ?)', [userId, ratingDate, rating, note]);
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
      const [rows] = await db.query(
        'SELECT rating_date FROM ratings WHERE user_id = ? ORDER BY rating_date ASC',
        [userId]
      );
      if (rows.length === 0) {
        return res.json({ current: 0, longest: 0 });
      }
      const dates = rows.map(r => r.rating_date.toISOString().split('T')[0]);
      const oneDayMs = 1000 * 60 * 60 * 24;

      // Longest historical run of consecutive days
      let longest = 1;
      let run = 1;
      for (let i = 1; i < dates.length; i++) {
        const gap = Math.round((new Date(dates[i]) - new Date(dates[i - 1])) / oneDayMs);
        if (gap === 1) {
          run += 1;
          if (run > longest) longest = run;
        } else {
          run = 1;
        }
      }

      // Current — count back from today (or yesterday if today not rated yet
      // so we don't break the user's streak before they've had a chance to rate)
      const haveDate = new Set(dates);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const startOffset = haveDate.has(todayStr) ? 0 : 1;
      let cursor = new Date(today);
      cursor.setUTCDate(cursor.getUTCDate() - startOffset);
      let current = 0;
      while (haveDate.has(cursor.toISOString().split('T')[0])) {
        current += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }

      res.json({ current, longest });
    } catch (err) {
      console.error('Error computing streak', err);
      res.status(500).json({ message: 'Error computing streak' });
    }
  });

// Insights endpoint — personal analytics dashboard data
router.get('/insights', async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }

    try {
      // 1) Pull every rating for this user — for a daily-rated user we'll
      // never exceed a few thousand rows in their lifetime. Aggregation is
      // cheaper to do in JS than to maintain dialect-portable SQL across
      // MySQL and SQLite.
      const [rows] = await db.query(
        'SELECT rating_date, rating FROM ratings WHERE user_id = ? ORDER BY rating_date ASC',
        [userId]
      );

      // Normalize to plain `YYYY-MM-DD` strings the same way ratings list
      // endpoints do — SQLite returns rating_date as a Date via the shim.
      const ratings = rows.map(r => ({
        date: r.rating_date.toISOString().split('T')[0],
        rating: r.rating
      }));

      // 2) Totals
      const totalRatings = ratings.length;
      const averageRating = totalRatings === 0
        ? 0
        : ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings;

      // 3) Streaks — walk consecutive YYYY-MM-DD dates.
      // "Current" includes today/yesterday so missing today doesn't break it
      // before the user has had a chance to rate. We compute against the
      // user's most-recent rating's date when there's nothing newer.
      let longestStreak = 0;
      let currentStreak = 0;
      if (totalRatings > 0) {
        let runLength = 1;
        longestStreak = 1;
        const oneDayMs = 1000 * 60 * 60 * 24;
        for (let i = 1; i < ratings.length; i++) {
          const prev = new Date(ratings[i - 1].date);
          const curr = new Date(ratings[i].date);
          const gap = Math.round((curr - prev) / oneDayMs);
          if (gap === 1) {
            runLength += 1;
            if (runLength > longestStreak) longestStreak = runLength;
          } else {
            runLength = 1;
          }
        }
        // Current streak: count back from today as long as days are present
        const haveDate = new Set(ratings.map(r => r.date));
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        // If today not rated, we still allow yesterday to be the streak head
        const startOffset = haveDate.has(today.toISOString().split('T')[0]) ? 0 : 1;
        let cursor = new Date(today);
        cursor.setUTCDate(cursor.getUTCDate() - startOffset);
        let count = 0;
        while (haveDate.has(cursor.toISOString().split('T')[0])) {
          count += 1;
          cursor.setUTCDate(cursor.getUTCDate() - 1);
        }
        currentStreak = count;
      }

      // 4) Day-of-week averages — 0 = Sunday in JS, so we reindex to Mon..Sun
      // because that's how week views typically read.
      const dowSums = [0, 0, 0, 0, 0, 0, 0];
      const dowCounts = [0, 0, 0, 0, 0, 0, 0];
      for (const r of ratings) {
        const d = new Date(r.date);
        // Convert JS Sun=0..Sat=6 -> Mon=0..Sun=6
        const idx = (d.getUTCDay() + 6) % 7;
        dowSums[idx] += r.rating;
        dowCounts[idx] += 1;
      }
      const dayOfWeekAverages = dowSums.map((sum, i) => ({
        day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
        average: dowCounts[i] === 0 ? null : sum / dowCounts[i],
        count: dowCounts[i]
      }));

      // 5) Monthly averages — last 12 months, most-recent first. Even months
      // with zero ratings get an entry so the chart has a stable 12-bar shape.
      const monthlyAverages = [];
      const now = new Date();
      for (let i = 0; i < 12; i++) {
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const yyyy = monthStart.getUTCFullYear();
        const mm = String(monthStart.getUTCMonth() + 1).padStart(2, '0');
        const prefix = `${yyyy}-${mm}`;
        const inMonth = ratings.filter(r => r.date.startsWith(prefix));
        monthlyAverages.push({
          month: prefix,
          average: inMonth.length === 0 ? null : inMonth.reduce((s, r) => s + r.rating, 0) / inMonth.length,
          count: inMonth.length
        });
      }

      // 6) Recent trend — last 30 days as {date, rating|null}
      const recentTrend = [];
      const haveDate = new Map(ratings.map(r => [r.date, r.rating]));
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - i);
        const ds = d.toISOString().split('T')[0];
        recentTrend.push({ date: ds, rating: haveDate.has(ds) ? haveDate.get(ds) : null });
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
