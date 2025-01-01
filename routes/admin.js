const os = require('os');
const disk = require('diskusage-ng');
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { sendEmail } = require('../services/emailService');

// Middleware: Check if user is admin
router.use(async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(403).json({ message: 'Not logged in' });
  }
  // Query the user's role
  const [rows] = await db.query('SELECT user_role FROM users WHERE id=?', [req.session.userId]);
  if (!rows.length || rows[0].user_role !== 'admin') {
    return res.status(403).json({ message: 'Not authorized' });
  }
  next();
});

/**
 * GET /api/admin/stats
 * Return system stats and user count
 */
router.get('/stats', async (req, res) => {
  try {
    const hostname = os.hostname();
    const nodeVersion = process.version;

    // CPU load (1m, 5m, 15m):
    const load = os.loadavg(); // array of [1,5,15] minute loads
    const cpuLoad1m = load[0].toFixed(2);
    const cpuLoad5m = load[1].toFixed(2);
    const cpuLoad15m = load[2].toFixed(2);
    // We can define an average as (1m+5m+15m)/3:
    const cpuLoadAvg = ((load[0] + load[1] + load[2]) / 3).toFixed(2);

    // Physical memory used by this Node.js process
    // process.memoryUsage() returns an object with heapUsed, rss, etc.
    // We’ll use rss (resident set size) as a measure of total memory usage for the process
    const memUsage = process.memoryUsage();
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);
    const memoryUsage = `RSS: ${rssMB} MB`;

    // If you also want to see heap used:
    // const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);

    // Disk usage
    // We’ll pick root directory or whichever relevant path:
    let diskUsage = 'N/A';
    try {
      const root = path.parse(process.cwd()).root;
      const info = await getDiskUsageAsync(root);
      // info.available, info.total, info.used
      diskUsage = `
               used ${(info.used / 1024 / 1024 / 1024).toFixed(2)} GB, 
               total ${(info.total / 1024 / 1024 / 1024).toFixed(2)} GB,
               available ${(info.available / 1024 / 1024 / 1024).toFixed(2)} GB
               `;
    } catch (err) {
      console.log('diskusage error:', err);
    }

    // # of users
    const [userCountRows] = await db.query('SELECT COUNT(*) as count FROM users');
    const userCount = userCountRows[0].count;

    // We can add more relevant stats:
    //  - uptime: how long the process has been running
    //  - environment: dev/prod, etc.
    const uptimeSeconds = process.uptime();
    const uptimeFormatted = `${(uptimeSeconds / 60).toFixed(2)} minutes`;

    res.json({
      hostname,
      nodeVersion,
      cpuLoad1m,
      cpuLoad5m,
      cpuLoad15m,
      cpuLoadAvg,
      memoryUsage,
      diskUsage,
      userCount,
      uptime: uptimeFormatted
    });
  } catch (err) {
    console.error('Error retrieving stats', err);
    res.status(500).json({ message: 'Error retrieving stats' });
  }
});

/**
 * GET /api/admin/users
 * Return a list of all users (or maybe just emails, if we want to keep it minimal)
 */
router.get('/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT email, first_name, last_name FROM users');
    res.json(rows);
  } catch (err) {
    console.error('Error retrieving user list', err);
    res.status(500).json({ message: 'Error retrieving user list' });
  }
});

/**
 * POST /api/admin/send-emails
 * Send an ad-hoc email to all or a subset
 */
router.post('/send-emails', async (req, res) => {
  const { subject, body, recipientType, emails } = req.body;

  if (!subject || !body) {
    return res.status(400).json({ message: 'Subject and body are required' });
  }

  try {
    let recipients = [];

    if (recipientType === 'all') {
      // Retrieve all user emails
      const [rows] = await db.query('SELECT email FROM users');
      recipients = rows.map(r => r.email);
    } else if (recipientType === 'subset') {
      // Use provided emails array
      if (!emails || !Array.isArray(emails)) {
        return res.status(400).json({ message: 'No emails provided' });
      }
      recipients = emails;
    }

    for (const email of recipients) {
      await sendEmail({
        to: email,
        subject,
        html: body
      });
    }

    return res.status(200).json({ message: 'Emails sent successfully' });
  } catch (err) {
    console.error('Error sending emails', err);
    res.status(500).json({ message: 'Error sending emails' });
  }
});

const getDiskUsageAsync = (path) => {
  const disk = require('diskusage-ng');
  return new Promise((resolve, reject) => {
    disk(path, (err, usage) => {
      if (err) return reject(err);
      resolve(usage);
    });
  });
};

module.exports = router;
