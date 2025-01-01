require('dotenv').config();
const nodemailer = require('nodemailer');

const {
  DEV_MODE = 'true',
  GMAIL_USER,
  GMAIL_PASS,
  GMAIL_FROM
} = process.env;

/**
 * We'll create a single transporter if devMode is false.
 */
let transporter = null;
if (DEV_MODE.toLowerCase() === 'false') {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS
    }
  });
}

/**
 * Utility function to send an email with the given details.
 * If devMode is true, we'll just log.
 */
async function sendEmail({ to, subject, text, html }) {
  if (!to) return;

  if (DEV_MODE.toLowerCase() === 'true') {
    console.log(`[DevMode] Would send email to: ${to}\nSubject: ${subject}\nText:\n${text}\nHTML:\n${html || '(no HTML)'}`);
    return;
  }

  if (!transporter) {
    throw new Error('Nodemailer transporter not configured (devMode=false but no transporter)');
  }

  const mailOptions = {
    from: GMAIL_FROM || GMAIL_USER,
    to,
    subject,
    text,
  };
  if (html) {
    mailOptions.html = html;
  }

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Email sent to ${to}`);
  } catch (err) {
    console.error('[EmailService] Failed to send email', err);
    throw err;
  }
}

module.exports = {
  sendEmail
};
