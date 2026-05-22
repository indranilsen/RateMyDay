// services/monthlyRecap.js
// Shared monthly-recap logic — used by both the hourly reminder cron
// (reminder-task.js) and the admin "send ad-hoc recap" endpoints
// (routes/admin.js). Single source of truth for stats + email template
// so the cron-sent recap and admin-triggered recap look identical.

const moment = require('moment-timezone');
const { db } = require('../db');
const { sendEmail } = require('./emailService');

const APP_LINK = 'https://apps.indranilsen.com/rate-my-day';

// Inlined 10-step rating palette — email clients can't import JS modules,
// so the palette is duplicated here (and in reminder-task.js's button row).
const REMINDER_PALETTE = {
  1:  '#ff3e36', 2:  '#ff643c', 3:  '#ff7c42', 4:  '#ff9746', 5:  '#ffb44b',
  6:  '#ffd24f', 7:  '#ddde55', 8:  '#b0d85a', 9:  '#85d15f', 10: '#5eca64'
};

/**
 * Compute the prior-month moment in the user's local timezone.
 * Same anchor the cron uses, so admin-triggered recaps cover the same
 * window the user would've gotten on the 1st.
 */
function priorMonthInTz(localTz) {
  return moment().tz(localTz || 'UTC').subtract(1, 'month');
}

/**
 * Pull the user's ratings for the given month and reduce to summary stats.
 * One range query + JS reduction — cheaper than several aggregate queries
 * and easier to extend with new fields later.
 */
async function computeMonthlyStats(userId, monthMoment) {
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

  // mysql2 returns DATE as Date, sqlite returns it as a string
  const normalized = rows.map(r => ({
    date: r.rating_date instanceof Date
      ? r.rating_date.toISOString().split('T')[0]
      : String(r.rating_date).split('T')[0],
    rating: Number(r.rating)
  }));

  const daysRated = normalized.length;
  const sum = normalized.reduce((s, r) => s + r.rating, 0);
  const average = daysRated > 0 ? sum / daysRated : 0;

  // Top tie-break = latest date (recent peak feels more relevant).
  // Bottom tie-break = earliest date (slight kindness — don't surface a
  // recent rough day if there was an earlier matching one).
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

  const distribution = Array.from({ length: 10 }, () => 0);
  for (const r of normalized) {
    if (r.rating >= 1 && r.rating <= 10) distribution[r.rating - 1] += 1;
  }

  return { daysRated, daysInMonth, average, topDay, bottomDay, distribution };
}

// Mini histogram row — 10 vertical bars colored by the rating palette.
// Heights scaled to the month's max bucket so a single dominant rating
// still shows the rest as visible slivers. Inline styles only.
function buildDistributionHtml(distribution) {
  const max = Math.max(1, ...distribution);
  const maxBarHeight = 60;
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
      <td style="padding: 8px 0; color: #787878; font-size: 14px;">Top day</td>
      <td style="padding: 8px 0; text-align: right; color: #404040; font-size: 14px; font-weight: 500;">
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
      <td style="padding: 8px 0; color: #787878; font-size: 14px;">Toughest day</td>
      <td style="padding: 8px 0; text-align: right; color: #404040; font-size: 14px; font-weight: 500;">
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

  // System font stack — see note in reminder-task.js getReminderEmailHtml.
  // Webmail clients strip external stylesheet links; Roboto in the stack
  // means it'll still be used when locally installed, otherwise system UI
  // font (SF / Segoe / etc.) renders crisply at any weight ≥ 400.
  return `
  <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your ${monthName} on RateMyDay</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f7f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif;">
<div style="
    max-width: 600px;
    margin: 40px auto;
    background-color: #ffffff;
    border-radius: 8px;
    padding: 32px 24px;
    border: 1px solid #e0e0e0;
    box-shadow: 0px 2px 8px rgba(0, 0, 0, 0.06);
  ">
    <p style="text-align: center; margin: 0 0 4px 0; color: #a0a0a0; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase;">
      Your monthly recap
    </p>
    <h2 style="
      text-align: center;
      color: #404040;
      margin: 0 0 24px 0;
      font-weight: 500;
      font-size: 24px;
      letter-spacing: 0.02em;
    ">
        ${monthName} <span style="color: #787878; font-weight: 400;">${year}</span>
    </h2>

    <div style="text-align: center; margin: 24px 0;">
      <div style="
        display: inline-block;
        width: 96px;
        height: 96px;
        line-height: 96px;
        background-color: ${avgColor};
        color: #ffffff;
        font-size: 34px;
        font-weight: 500;
        border-radius: 50%;
      ">${avgStr}</div>
      <p style="margin: 8px 0 0 0; color: #787878; font-size: 12px; letter-spacing: 0.08em;">
        AVERAGE RATING
      </p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr>
        <td style="padding: 8px 0; color: #787878; font-size: 14px;">Days rated</td>
        <td style="padding: 8px 0; text-align: right; color: #404040; font-size: 14px; font-weight: 500;">
          ${stats.daysRated} <span style="color: #a0a0a0; font-weight: 400;">/ ${stats.daysInMonth}</span>
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
        border: 1px solid #787878;
        color: #404040;
        padding: 10px 22px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.06em;
        background-color: #ffffff;
        text-decoration: none;
      ">
            SEE FULL INSIGHTS
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

/**
 * Compose subject + text + html for a given month's recap.
 * Pure: doesn't touch DB or SMTP. Useful for previewing.
 */
function buildMonthlyRecapEmail(monthMoment, stats) {
  const monthName = monthMoment.format('MMMM');
  const year = monthMoment.format('YYYY');
  const subject = `Your ${monthName} on RateMyDay`;
  const textLines = [
    `Your ${monthName} ${year} on RateMyDay:`,
    `  Average: ${stats.average.toFixed(1)}`,
    `  Days rated: ${stats.daysRated} of ${stats.daysInMonth}`
  ];
  if (stats.topDay) textLines.push(`  Top day: ${stats.topDay.date} (${stats.topDay.rating})`);
  if (stats.bottomDay) textLines.push(`  Toughest day: ${stats.bottomDay.date} (${stats.bottomDay.rating})`);
  textLines.push('', `Open RateMyDay: ${APP_LINK}/insights`);

  const html = getMonthlyRecapHtml(monthName, year, stats, APP_LINK);
  return { subject, text: textLines.join('\n'), html };
}

/**
 * End-to-end: compute prior-month stats for one user and send the recap.
 * Returns { sent: true } on success, or { sent: false, reason } on a soft
 * skip (no email, no ratings, etc.) so the caller can summarize batches.
 * Throws on hard errors (DB / SMTP) — caller decides whether to swallow.
 */
async function sendRecapForUser({ userId, email, localTimezone }) {
  if (!email) return { sent: false, reason: 'no_email' };

  const monthMoment = priorMonthInTz(localTimezone);
  const stats = await computeMonthlyStats(userId, monthMoment);

  if (stats.daysRated === 0) {
    return { sent: false, reason: 'no_ratings', month: monthMoment.format('YYYY-MM') };
  }

  const { subject, text, html } = buildMonthlyRecapEmail(monthMoment, stats);
  await sendEmail({ to: email, subject, text, html });
  return { sent: true, month: monthMoment.format('YYYY-MM') };
}

module.exports = {
  REMINDER_PALETTE,
  priorMonthInTz,
  computeMonthlyStats,
  buildMonthlyRecapEmail,
  sendRecapForUser
};
