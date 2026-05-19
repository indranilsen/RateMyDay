// reminder-task.js
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');
const { db, listReminderCandidates, listMonthlyRecapCandidates } = require('./db');
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

    // Monthly recap pass — runs on the same hourly tick. Opted-in users get a
    // recap of the *previous* month on the 1st, at the same local hour they
    // picked for reminders (reuse reminderTime hour; default 09:00). Separate
    // candidate list so users can opt into either feature independently.
    await runMonthlyRecapPass();
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

// ---------- Monthly recap ----------

// Hourly pass: for each opted-in user, if it's the 1st of the month at their
// preferred hour (in their local tz) and we haven't already sent this month's
// recap, compute prior-month stats and send the email.
async function runMonthlyRecapPass() {
  let rows;
  try {
    rows = await listMonthlyRecapCandidates();
  } catch (err) {
    console.error('[Recap] Failed to list candidates', err);
    return;
  }

  await Promise.allSettled(rows.map(async (row) => {
    let userSettings;
    try {
      userSettings = row.data;
      if (typeof userSettings === 'string') userSettings = JSON.parse(userSettings);
    } catch (err) {
      console.error('[Recap] Error parsing settings for user', row.userId, err);
      return;
    }

    const userEmail = row.email;
    if (!userEmail) return;

    const localTz = userSettings.localTimezone || 'UTC';
    const reminderTime = userSettings.reminderTime || '09:00';
    const [recapHour] = reminderTime.split(':').map(Number);

    const nowLocal = moment().tz(localTz);

    // Send on the 1st only, and only on the user's chosen hour
    if (nowLocal.date() !== 1) return;
    if (nowLocal.hour() !== recapHour) return;

    // Prior month bounds (local), tagged "YYYY-MM" for the dedup key
    const priorMonthMoment = nowLocal.clone().subtract(1, 'month');
    const priorYearMonth = priorMonthMoment.format('YYYY-MM');

    if (userSettings.lastRecapSent === priorYearMonth) {
      // Already sent this month's recap during an earlier hourly tick
      return;
    }

    let stats;
    try {
      stats = await getMonthlyStats(row.userId, priorMonthMoment);
    } catch (err) {
      console.error('[Recap] Failed to compute stats for user', row.userId, err);
      return;
    }

    // No ratings in the prior month — skip rather than send an empty card.
    // Avoids guilt-tripping users who didn't engage; reminders cover that loop.
    if (stats.daysRated === 0) return;

    await sendMonthlyRecap(userEmail, row.userId, priorMonthMoment, stats);
    await updateLastRecapSent(row.userId, priorYearMonth);
  }));
}

// Single query for the month's ratings + JS-side reduction. Cheaper than
// many small aggregates and easier to extend (top day, bottom day, dist).
async function getMonthlyStats(userId, monthMoment) {
  const start = monthMoment.clone().startOf('month').format('YYYY-MM-DD');
  const end = monthMoment.clone().endOf('month').format('YYYY-MM-DD');
  const daysInMonth = monthMoment.daysInMonth();

  const [rows] = await db.query(
    `SELECT rating_date, rating
       FROM ratings
       WHERE user_id = ?
         AND rating_date BETWEEN ? AND ?`,
    [userId, start, end]
  );

  // Normalize rating_date — mysql2 returns Date objects, sqlite returns strings
  const normalized = rows.map(r => ({
    date: r.rating_date instanceof Date
      ? r.rating_date.toISOString().split('T')[0]
      : String(r.rating_date).split('T')[0],
    rating: Number(r.rating)
  }));

  const daysRated = normalized.length;
  const sum = normalized.reduce((s, r) => s + r.rating, 0);
  const average = daysRated > 0 ? sum / daysRated : 0;

  // Top/bottom day. Tie-break top by latest date (most recent peak), bottom
  // by earliest date (so we don't dredge up a recent rough day if there was
  // an earlier matching one — slight kindness bias).
  let topDay = null;
  let bottomDay = null;
  for (const r of normalized) {
    if (!topDay || r.rating > topDay.rating || (r.rating === topDay.rating && r.date > topDay.date)) {
      topDay = r;
    }
    if (!bottomDay || r.rating < bottomDay.rating || (r.rating === bottomDay.rating && r.date < bottomDay.date)) {
      bottomDay = r;
    }
  }

  // 1..10 distribution for the mini histogram in the email
  const distribution = Array.from({ length: 10 }, () => 0);
  for (const r of normalized) {
    if (r.rating >= 1 && r.rating <= 10) distribution[r.rating - 1] += 1;
  }

  return { daysRated, daysInMonth, average, topDay, bottomDay, distribution };
}

async function sendMonthlyRecap(recipientEmail, userId, monthMoment, stats) {
  const monthName = monthMoment.format('MMMM');
  const year = monthMoment.format('YYYY');
  const subject = `Your ${monthName} on RateMyDay`;
  const appLink = 'https://apps.indranilsen.com/rate-my-day';

  const textLines = [
    `Your ${monthName} ${year} on RateMyDay:`,
    `  Average: ${stats.average.toFixed(1)}`,
    `  Days rated: ${stats.daysRated} of ${stats.daysInMonth}`,
  ];
  if (stats.topDay) textLines.push(`  Top day: ${stats.topDay.date} (${stats.topDay.rating})`);
  if (stats.bottomDay) textLines.push(`  Toughest day: ${stats.bottomDay.date} (${stats.bottomDay.rating})`);
  textLines.push('', `Open RateMyDay: ${appLink}/insights`);

  const html = getMonthlyRecapHtml(monthName, year, stats, appLink);

  try {
    await sendEmail({
      to: recipientEmail,
      subject,
      text: textLines.join('\n'),
      html
    });
    console.log(`[Recap] Email sent to ${recipientEmail} (user: ${userId}) for ${monthMoment.format('YYYY-MM')}`);
  } catch (err) {
    console.error('[Recap] Failed to send email to', recipientEmail, err);
  }
}

async function updateLastRecapSent(userId, yearMonth) {
  try {
    await db.query(
      `UPDATE settings
         SET data = JSON_SET(data, '$.lastRecapSent', ?)
         WHERE user_id = ?`,
      [yearMonth, userId]
    );
  } catch (err) {
    console.error('[Recap] Failed to update lastRecapSent for user', userId, err);
  }
}

// Mini histogram row — 10 vertical bars colored by the rating palette. Heights
// scaled relative to the month's max bucket so a single dominant rating still
// shows the other ratings as visible slivers. Inline styles only — Gmail/etc
// drop <style> blocks.
function buildDistributionHtml(distribution) {
  const max = Math.max(1, ...distribution);
  const maxBarHeight = 60; // px
  const cells = distribution.map((count, i) => {
    const rating = i + 1;
    const height = Math.round((count / max) * maxBarHeight);
    const bg = REMINDER_PALETTE[rating];
    return `
      <td style="vertical-align: bottom; padding: 0 3px; text-align: center;">
        <div style="
          width: 22px;
          height: ${height}px;
          background-color: ${bg};
          border-radius: 2px;
          margin: 0 auto;
        "></div>
        <div style="font-size: 10px; color: #a0a0a0; margin-top: 4px;">${rating}</div>
      </td>`;
  }).join('');

  return `
    <table style="margin: 0 auto; border-collapse: collapse;">
      <tr style="height: ${maxBarHeight}px;">${cells}</tr>
    </table>
    <p style="text-align: center; margin: 8px 0 0 0; color: #a0a0a0; font-size: 11px; letter-spacing: 0.06em;">
      RATINGS THIS MONTH
    </p>
  `;
}

function getMonthlyRecapHtml(monthName, year, stats, appLink) {
  const avgStr = stats.average.toFixed(1);
  const avgColor = REMINDER_PALETTE[Math.max(1, Math.min(10, Math.round(stats.average)))];

  const topDayBlock = stats.topDay ? `
    <tr>
      <td style="padding: 8px 0; color: #808080; font-size: 14px;">Top day</td>
      <td style="padding: 8px 0; text-align: right; color: #404040; font-size: 14px;">
        ${stats.topDay.date}
        <span style="
          display: inline-block;
          width: 22px;
          height: 22px;
          line-height: 22px;
          margin-left: 8px;
          background-color: ${REMINDER_PALETTE[stats.topDay.rating]};
          color: #ffffff;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 500;
          text-align: center;
          vertical-align: middle;
        ">${stats.topDay.rating}</span>
      </td>
    </tr>` : '';

  const bottomDayBlock = stats.bottomDay && (!stats.topDay || stats.bottomDay.date !== stats.topDay.date) ? `
    <tr>
      <td style="padding: 8px 0; color: #808080; font-size: 14px;">Toughest day</td>
      <td style="padding: 8px 0; text-align: right; color: #404040; font-size: 14px;">
        ${stats.bottomDay.date}
        <span style="
          display: inline-block;
          width: 22px;
          height: 22px;
          line-height: 22px;
          margin-left: 8px;
          background-color: ${REMINDER_PALETTE[stats.bottomDay.rating]};
          color: #ffffff;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 500;
          text-align: center;
          vertical-align: middle;
        ">${stats.bottomDay.rating}</span>
      </td>
    </tr>` : '';

  return `
  <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your ${monthName} on RateMyDay</title>
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
    <p style="text-align: center; margin: 0 0 4px 0; color: #a0a0a0; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase;">
      Your monthly recap
    </p>
    <h2 style="
      text-align: center;
      color: #505050;
      margin: 0 0 24px 0;
      font-weight: 200;
      font-size: 26px;
      letter-spacing: 0.04em;
    ">
        ${monthName} <span style="color: #a0a0a0; font-weight: 100;">${year}</span>
    </h2>

    <div style="text-align: center; margin: 24px 0;">
      <div style="
        display: inline-block;
        width: 96px;
        height: 96px;
        line-height: 96px;
        background-color: ${avgColor};
        color: #ffffff;
        font-size: 36px;
        font-weight: 300;
        border-radius: 50%;
      ">${avgStr}</div>
      <p style="margin: 8px 0 0 0; color: #808080; font-size: 13px; letter-spacing: 0.06em;">
        AVERAGE RATING
      </p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr>
        <td style="padding: 8px 0; color: #808080; font-size: 14px;">Days rated</td>
        <td style="padding: 8px 0; text-align: right; color: #404040; font-size: 14px;">
          ${stats.daysRated} <span style="color: #a0a0a0;">/ ${stats.daysInMonth}</span>
        </td>
      </tr>
      ${topDayBlock}
      ${bottomDayBlock}
    </table>

    <div style="margin: 32px 0 8px 0;">
      ${buildDistributionHtml(stats.distribution)}
    </div>

    <div style="text-align: center; margin: 32px 0 8px 0;">
        <a href="${appLink}/insights" style="
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
            See full insights
        </a>
    </div>
    <p style="text-align: center; margin: 16px 0 0 0; color: #a0a0a0; font-size: 11px;">
      You can turn off the monthly recap in Settings.
    </p>
</div>
</body>
</html>
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
