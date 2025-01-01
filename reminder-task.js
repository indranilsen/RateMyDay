// reminder-task.js
require('dotenv').config();
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');
const { db } = require('./db');
const { sendEmail } = require('./services/emailService');

const {
  DISABLE_REMINDERS = 'false',
} = process.env;

if (DISABLE_REMINDERS.toLowerCase() === 'true') {
  console.log('[Reminders] DISABLE_REMINDERS is true. Skipping reminder scheduling.');
  return;
}

console.log('[Reminders] Starting reminder scheduler.');

/**
 * CRON: runs every hour on the hour
 */
let hourlyCron = '0 * * * *';
cron.schedule(hourlyCron, async () => {
  console.log('[Reminders] Checking for reminders...');

  try {
    // 1) Get all users with sendReminders = true
    // We'll need to read lastReminderSent from the same JSON column
    const [rows] = await db.query(`
      SELECT u.id AS userId, u.email, s.data
      FROM users u
             JOIN settings s ON u.id = s.user_id
      WHERE JSON_EXTRACT(s.data, '$.sendReminders') = true
         OR JSON_UNQUOTE(JSON_EXTRACT(s.data, '$.sendReminders')) = 'true';
    `);

    for (const row of rows) {
      let userSettings;
      try {
        userSettings = row.data;
      } catch (err) {
        console.error('Error parsing settings for user', row.userId, err);
        continue;
      }

      const userEmail = row.email;
      const localTz = userSettings.localTimezone || 'UTC';
      const reminderTime = userSettings.reminderTime || '08:00';
      const reminderCadence = userSettings.reminderCadence || 'daily';
      const lastSent = userSettings.lastReminderSent || null;

      // Check local time vs reminderTime
      const nowLocal = moment().tz(localTz);
      const [remHour, remMinute] = reminderTime.split(':').map(Number);

      if (nowLocal.hour() === remHour) {
        // If daily => only send if user hasn't rated,
        // and if we haven't already sent a reminder today
        if (reminderCadence === 'daily') {
          const todayLocal = nowLocal.format('YYYY-MM-DD');

          // 1) Already sent a reminder today?
          if (lastSent === todayLocal) {
            // skip (we only send the reminder once)
            continue;
          }

          // 2) Check if user has rating for today
          const hasRated = await hasUserRatedToday(row.userId, localTz);
          if (!hasRated) {
            // Send email, then update lastReminderSent to today's date
            await sendReminder(userEmail, row.userId, localTz, 'daily');
            await updateLastReminderSent(row.userId, todayLocal);
          }
        }
        // If weekly => only on Sunday, and only once that Sunday
        else if (reminderCadence === 'weekly') {
          if (nowLocal.day() === 0) { // Sunday
            const sundayDate = nowLocal.format('YYYY-MM-DD');

            // Already sent a reminder this Sunday?
            if (lastSent === sundayDate) {
              continue; // skip
            }

            // Check if missed any day Monday..Sunday
            const missedDays = await missedRatingsThisWeek(row.userId, localTz);
            if (missedDays.length > 0) {
              await sendReminder(userEmail, row.userId, localTz, 'weekly', missedDays);
              // Mark lastReminderSent to today's date (the Sunday date)
              await updateLastReminderSent(row.userId, sundayDate);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[Reminders] Error in cron job:', error);
  }
});

/**
 * Because rating_date is stored as DATE, we compare `rating_date = 'YYYY-MM-DD'`
 */
async function hasUserRatedToday(userId, localTz) {
  const localDate = moment().tz(localTz).format('YYYY-MM-DD');
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count
     FROM ratings
     WHERE user_id = ?
       AND rating_date = ?`,
    [userId, localDate]
  );
  return rows[0].count > 0;
}

/**
 * For weekly => Monday..Sunday check.
 */
async function missedRatingsThisWeek(userId, localTz) {
  const nowLocal = moment().tz(localTz);
  let startOfMondayLocal = nowLocal.clone().day(1).startOf('day');
  const endOfSundayLocal = nowLocal.clone().endOf('day');

  if (nowLocal.day() === 0) {
    startOfMondayLocal = startOfMondayLocal.subtract(7, 'days');
  }

  const missedDates = [];
  let dayCursor = startOfMondayLocal.clone();
  while (dayCursor.isSameOrBefore(endOfSundayLocal, 'day')) {
    const localDate = dayCursor.format('YYYY-MM-DD');
    const [rows] = await db.query(`
        SELECT COUNT(*) AS count
        FROM ratings
        WHERE user_id = ?
          AND rating_date = ?`,
      [userId, localDate]
    );
    if (rows[0].count === 0) {
      missedDates.push(localDate);
    }
    dayCursor.add(1, 'day');
  }
  return missedDates;
}

async function sendReminder(recipientEmail, userId, localTz, cadence, missedDays = []) {
  if (!recipientEmail) return;

  const subject = 'RateMyDay Reminder';
  // For best practice, provide a fallback plain-text version:
  let textBody = 'Hello! This is your reminder to fill out your rating in RateMyDay.\n';

  if (cadence === 'daily') {
    textBody += '\nIt looks like you haven’t rated your day yet!';
  } else if (cadence === 'weekly') {
    textBody += '\nYou missed the following days:\n';
    textBody += missedDays.map(d => ` - ${d}`).join('\n');
  }

  // Create your fancy HTML body
  const appLink = 'https://apps.indranilsen.com/rate-my-day';
  const htmlBody = getReminderEmailHtml(cadence, missedDays, appLink);

  try {
    await sendEmail({
      to: recipientEmail,
      subject,
      text: textBody,    // fallback for older email clients
      html: htmlBody     // the polished HTML version
    });
    console.log(`[Reminders] Email sent to ${recipientEmail} (user: ${userId})`);
  } catch (err) {
    console.error('[Reminders] Failed to send email to', recipientEmail, err);
  }
}


/**
 * Update the user's settings JSON to store lastReminderSent = someDateString.
 */
async function updateLastReminderSent(userId, dateString) {
  // We'll fetch the current data, parse it, update lastReminderSent, then store it
  try {
    // 1) Retrieve current JSON
    const [rows] = await db.query(`SELECT data FROM settings WHERE user_id = ? LIMIT 1`, [userId]);
    if (!rows.length) return; // no settings row, skip

    let userSettings = {};
    try {
      userSettings = rows[0].data || {};
    } catch (err) {
      console.error('[Reminders] Could not parse settings JSON for user', userId, err);
      return;
    }

    // 2) Update lastReminderSent
    userSettings.lastReminderSent = dateString;

    // 3) Write back to DB
    await db.query(
      'UPDATE settings SET data = ? WHERE user_id = ?',
      [JSON.stringify(userSettings), userId]
    );
  } catch (err) {
    console.error('[Reminders] Failed to update lastReminderSent for user', userId, err);
  }
}

function getReminderEmailHtml(cadence, missedDays, appLink) {
  // Build some dynamic content
  let contentParagraph = '';
  if (cadence === 'daily') {
    contentParagraph = `We noticed you haven’t rated your day yet. Take a moment to reflect on how your day went and how you're feeling.`;
  } else if (cadence === 'weekly') {
    // List missed days
    const missedList = missedDays.map(d => `<li style="
      margin: 16px 0;
      font-weight: 100;
      font-size: 16px;
      color: #808080;
      line-height: 1.5;
    ">${d}</li>`).join('');

    contentParagraph = `
      We noticed you missed the following days. Take a moment to reflect on how your week went and how you're feeling.
      
      <ul>${missedList}</ul>
    `;
  }

  // Return an HTML template (inline styles for cross-client compatibility)
  return `
  <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RateMyDay Reminder</title>
    <!-- Link Roboto font -->
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400&display=swap" rel="stylesheet" />
</head>
<body style="margin: 0; padding: 0; background-color: #f7f7f7; font-family: 'Roboto', 'Helvetica', 'Arial', sans-serif;">
<div style="
    max-width: 600px;
    margin: 40px auto;
    background-color: #ffffff;
    border-radius: 8px;
    padding: 24px;
    border: 1px solid #ddd;
    box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
  ">
    <h2 style="
      text-align: center;
      color: #787878;
      margin-bottom: 20px;
      font-weight: 200;
      font-size: 24px;
      letter-spacing: 0.05em;
    ">
        Reflect on Your Day with <span style="font-weight: 300">RateMyDay</span>
    </h2>
    <p style="
      margin: 16px 0;
      font-weight: 100;
      font-size: 16px;
      color: #808080;
      line-height: 1.5;
    ">
        ${contentParagraph}
    </p>
    <div style="text-align: center; margin: 24px 0;">
        <a href="${appLink}" style="
        display: inline-block;
        border: 1px solid #2477C8FF;
        color: #2477C8FF;
        padding: 12px 24px;
        border-radius: 4px;
        font-size: 16px;
        font-weight: 300;
        letter-spacing: 0.05em;
        background-color: transparent;
        box-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
        text-decoration: none;
      ">
            RateMyDay Now
        </a>
    </div>
</div>
</body>
</html>

  `;
}
