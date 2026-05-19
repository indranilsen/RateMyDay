// routes/settings.js
const express = require('express');
const moment = require('moment-timezone');
const router = express.Router();
const { db } = require('../db');

// Allowlist + per-field validation for incoming settings payloads.
// Unknown keys are silently dropped (strict allowlist), bad values are rejected.
const validateSettings = (body) => {
  const errors = [];
  const validated = {};

  if (body == null || typeof body !== 'object') {
    errors.push('Body must be a JSON object');
    return { validated, errors };
  }

  if ('sendReminders' in body) {
    if (typeof body.sendReminders !== 'boolean') {
      errors.push('sendReminders must be a boolean');
    } else {
      validated.sendReminders = body.sendReminders;
    }
  }
  if ('localTimezone' in body) {
    if (typeof body.localTimezone !== 'string' || !moment.tz.zone(body.localTimezone)) {
      errors.push('localTimezone must be a valid IANA timezone');
    } else {
      validated.localTimezone = body.localTimezone;
    }
  }
  if ('reminderTime' in body) {
    if (typeof body.reminderTime !== 'string' || !/^\d{2}:\d{2}$/.test(body.reminderTime)) {
      errors.push('reminderTime must be in HH:MM format');
    } else {
      validated.reminderTime = body.reminderTime;
    }
  }
  if ('reminderCadence' in body) {
    if (body.reminderCadence !== 'daily' && body.reminderCadence !== 'weekly') {
      errors.push('reminderCadence must be "daily" or "weekly"');
    } else {
      validated.reminderCadence = body.reminderCadence;
    }
  }
  if ('sendMonthlyRecap' in body) {
    if (typeof body.sendMonthlyRecap !== 'boolean') {
      errors.push('sendMonthlyRecap must be a boolean');
    } else {
      validated.sendMonthlyRecap = body.sendMonthlyRecap;
    }
  }

  return { validated, errors };
};

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

  // Validate against the allowlist before touching the DB
  const { validated: newSettings, errors } = validateSettings(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ message: 'Invalid settings', errors });
  }

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
