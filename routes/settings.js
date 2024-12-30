// routes/settings.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');

// Retrieve the current user's settings
router.get('/', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(403).json({ message: 'Not logged in' });
  }

  try {
    // Fetch existing settings row for the current user
    const [rows] = await db.query(
      'SELECT data FROM settings WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (rows.length > 0) {
      // Some MySQL drivers return JSON columns as strings, others as objects
      let userSettings = rows[0].data;
      if (typeof userSettings === 'string') {
        userSettings = JSON.parse(userSettings);
      }
      return res.status(200).json(userSettings);
    } else {
      // No settings row found, return an empty object or default settings
      return res.status(200).json({});
    }
  } catch (error) {
    console.error('Error retrieving user settings', error);
    return res.status(500).json({ message: 'Error retrieving user settings' });
  }
});

// POST /api/settings
router.post('/', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(403).json({ message: 'Not logged in' });
  }

  const newSettings = req.body; // Already a JavaScript object

  try {
    // 1) Load existing row
    const [existingRows] = await db.query(
      'SELECT data FROM settings WHERE user_id = ? LIMIT 1',
      [userId]
    );

    let finalSettings = {};
    if (existingRows.length > 0) {
      // If your MySQL driver returns data as a string, you parse it.
      // If it returns data as an object, just skip parse.
      const existing = existingRows[0].data;
      if (typeof existing === 'string') {
        finalSettings = JSON.parse(existing);
      } else if (typeof existing === 'object' && existing !== null) {
        finalSettings = existing;
      }
    }

    // If user toggles sendReminders from false to true, reset lastReminderSent
    if (finalSettings.sendReminders === false && newSettings.sendReminders === true) {
      finalSettings.lastReminderSent = null;
    }

    // Merge new fields
    finalSettings = { ...finalSettings, ...newSettings };

    // Insert or update in DB
    if (existingRows.length > 0) {
      await db.query(
        'UPDATE settings SET data = ? WHERE user_id = ?',
        // We can safely stringify finalSettings to store it back
        [JSON.stringify(finalSettings), userId]
      );
    } else {
      await db.query(
        'INSERT INTO settings (user_id, data) VALUES (?, ?)',
        [userId, JSON.stringify(finalSettings)]
      );
    }

    return res.status(200).json({ message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Error saving user settings', error);
    return res.status(500).json({ message: 'Error saving user settings' });
  }
});

module.exports = router;
