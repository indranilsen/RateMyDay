// reminder-task.js
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');
const { db, listReminderCandidates } = require('./db');
const { sendEmail } = require('./services/emailService');

const {
  DISABLE_REMINDERS = 'false',
} = process.env;

if (DISABLE_REMINDERS.toLowerCase() === 'true') {
  console.log('[Reminders] DISABLE_REMINDERS is true. Skipping reminder scheduling.');
  return;
}

console.log('[Reminders] Starting reminder scheduler.');

// Re-entrancy guard: if a tick takes longer than an hour (slow SMTP, big user base),
// don't let the next hourly fire overlap with it.
let cronRunning = false;

/**
 * CRON: runs every hour on the hour
 */
let hourlyCron = '0 * * * *';
cron.schedule(hourlyCron, async () => {
  if (cronRunning) {
    console.log('[Reminders] Previous tick still running, skipping this hour.');
    return;
  }
  cronRunning = true;

  console.log('[Reminders] Checking for reminders...');

  try {
    // 1) Get all users with sendReminders = true (dialect-specific JSON_EXTRACT
    // comparison delegated to the backend so MySQL and SQLite both work)
    const rows = await listReminderCandidates();

    // 2) Each user's work is independent; run in parallel so the tick scales
    // with per-user latency, not with N. The DB pool naturally caps concurrency.
    await Promise.allSettled(rows.map(async (row) => {
      let userSettings;
      try {
        userSettings = row.data;
        if (typeof userSettings === 'string') {
          userSettings = JSON.parse(userSettings);
        }
      } catch (err) {
        console.error('[Reminders] Error parsing settings for user', row.userId, err);
        return;
      }

      const userEmail = row.email;
      const localTz = userSettings.localTimezone || 'UTC';
      const reminderTime = userSettings.reminderTime || '08:00';
      const reminderCadence = userSettings.reminderCadence || 'daily';
      const lastSent = userSettings.lastReminderSent || null;

      // Check local time vs reminderTime
      const nowLocal = moment().tz(localTz);
      const [remHour, remMinute] = reminderTime.split(':').map(Number);

      if (nowLocal.hour() !== remHour) return;

      // If daily => only send if user hasn't rated,
      // and if we haven't already sent a reminder today
      if (reminderCadence === 'daily') {
        const todayLocal = nowLocal.format('YYYY-MM-DD');

        // 1) Already sent a reminder today?
        if (lastSent === todayLocal) {
          // skip (we only send the reminder once)
          return;
        }

        // 2) Check if user has rating for today
        const hasRated = await hasUserRatedToday(row.userId, localTz);
        if (!hasRated) {
          // Send email, then update lastReminderSent to today's date
          await sendReminder(userEmail, row.userId, localTz, 'daily');
          await updateLastReminderSent(row.userId, todayLocal);
        }
        return;
      }

      // If weekly => only on Sunday, and only once that Sunday
      if (reminderCadence === 'weekly') {
        if (nowLocal.day() !== 0) return; // not Sunday
        const sundayDate = nowLocal.format('YYYY-MM-DD');

        // Already sent a reminder this Sunday?
        if (lastSent === sundayDate) return;

        // Check if missed any day Monday..Sunday
        const missedDays = await missedRatingsThisWeek(row.userId, localTz);
        if (missedDays.length > 0) {
          await sendReminder(userEmail, row.userId, localTz, 'weekly', missedDays);
          // Mark lastReminderSent to today's date (the Sunday date)
          await updateLastReminderSent(row.userId, sundayDate);
        }
      }
    }));
  } catch (error) {
    console.error('[Reminders] Error in cron job:', error);
  } finally {
    cronRunning = false;
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
 * One range query, diff against the requested days in JS — beats 7 sequential COUNTs.
 */
async function missedRatingsThisWeek(userId, localTz) {
  const nowLocal = moment().tz(localTz);
  let startOfMondayLocal = nowLocal.clone().day(1).startOf('day');
  const endOfSundayLocal = nowLocal.clone().endOf('day');

  if (nowLocal.day() === 0) {
    startOfMondayLocal = startOfMondayLocal.subtract(7, 'days');
  }

  // 1) Pull every rated date in the window with a single query
  const [rows] = await db.query(`
      SELECT rating_date
      FROM ratings
      WHERE user_id = ?
        AND rating_date BETWEEN ? AND ?`,
    [userId, startOfMondayLocal.format('YYYY-MM-DD'), endOfSundayLocal.format('YYYY-MM-DD')]
  );
  // mysql2 returns DATE columns as JS Date objects; format the same way ratings.js does
  // to sidestep timezone shifts from the local tz
  const ratedSet = new Set(rows.map(r => r.rating_date.toISOString().split('T')[0]));

  // 2) Compute the missed dates locally
  const missedDates = [];
  let dayCursor = startOfMondayLocal.clone();
  while (dayCursor.isSameOrBefore(endOfSundayLocal, 'day')) {
    const localDate = dayCursor.format('YYYY-MM-DD');
    if (!ratedSet.has(localDate)) {
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

  // The "rate today" buttons in the email link back to /rate?date=...&value=N.
  // Pick the most-relevant date for this reminder:
  //   daily  -> today in the user's local TZ
  //   weekly -> most-recent missed day (closest to "now")
  const appLink = 'https://apps.indranilsen.com/rate-my-day';
  const targetDate = cadence === 'weekly' && missedDays.length > 0
    ? missedDays[missedDays.length - 1]
    : moment().tz(localTz).format('YYYY-MM-DD');
  const htmlBody = getReminderEmailHtml(cadence, missedDays, appLink, targetDate);

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
 * Uses JSON_SET so we skip the read-modify-write round-trip (also race-safe).
 */
async function updateLastReminderSent(userId, dateString) {
  try {
    await db.query(
      `UPDATE settings
       SET data = JSON_SET(data, '$.lastReminderSent', ?)
       WHERE user_id = ?`,
      [dateString, userId]
    );
  } catch (err) {
    console.error('[Reminders] Failed to update lastReminderSent for user', userId, err);
  }
}

// Inlined 10-step rating palette so the email is self-contained — email
// clients won't import a JS module, so we duplicate the values from
// RatingColor.js here.
const REMINDER_PALETTE = {
  1:  '#ff3e36', 2:  '#ff643c', 3:  '#ff7c42', 4:  '#ff9746', 5:  '#ffb44b',
  6:  '#ffd24f', 7:  '#ddde55', 8:  '#b0d85a', 9:  '#85d15f', 10: '#5eca64'
};

// Build a one-click rating row as a table — most email clients hate flex
// but render tables reliably. Each cell links to /rate?date=...&value=N
// which the SPA's RateRedirect picks up and submits.
function buildRateButtonsHtml(appLink, targetDate) {
  const cells = [];
  for (let n = 1; n <= 10; n++) {
    const href = `${appLink}/rate?date=${targetDate}&value=${n}`;
    const bg = REMINDER_PALETTE[n];
    cells.push(`
      <td style="padding: 2px;">
        <a href="${href}" style="
          display: inline-block;
          width: 32px;
          height: 32px;
          line-height: 32px;
          text-align: center;
          background-color: ${bg};
          color: #ffffff;
          text-decoration: none;
          font-weight: 500;
          font-size: 14px;
          border-radius: 4px;
        ">${n}</a>
      </td>`);
  }
  return `
    <p style="margin: 16px 0 8px 0; color: #808080; font-size: 14px; letter-spacing: 0.04em;">
      Rate ${targetDate} in one click:
    </p>
    <table style="margin: 0 auto; border-collapse: collapse;">
      <tr>${cells.join('')}</tr>
    </table>
  `;
}

function getReminderEmailHtml(cadence, missedDays, appLink, targetDate) {
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

  const rateButtonsHtml = targetDate ? buildRateButtonsHtml(appLink, targetDate) : '';

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
        ${rateButtonsHtml}
        <p style="margin: 24px 0 8px 0; color: #808080; font-size: 14px;">
          Or open the app to add a note:
        </p>
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
