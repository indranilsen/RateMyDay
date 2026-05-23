const express = require('express');
// `bcrypt` (native C++ binding) is ~3-10× faster than `bcryptjs` (pure JS)
// for the same cost factor; matters because login holds an event-loop slot
// while it computes. We migrated from bcryptjs without changing the cost
// (10 rounds), so existing password hashes verify identically.
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');

const router = express.Router();

// Slow down brute-force attempts. 5 attempts/minute/IP is loose enough for a
// fat-finger user but tight enough to make credential stuffing painful.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in a minute.' }
});

// Slow down account-creation abuse: a flood of register calls is a way to
// enumerate existing emails (409 vs 201) and to pollute the users table.
// 3/minute/IP is tighter than login because legitimate registration is
// rare — a real person creates an account once per device, not five times.
const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts. Please try again in a minute.' }
});

// Registration endpoint
router.post('/register', registerLimiter, async (req, res) => {
  const { firstName, lastName, dob, email, password } = req.body;

  if (!firstName || !lastName || !dob || !email || !password) {
    return res.status(400).json({ message: 'Please provide all required fields' });
  }

  try {
    // Check if the user already exists
    const [existingUsers] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert the new user into the database
    await db.query(
      'INSERT INTO users (first_name, last_name, dob, email, password) VALUES (?, ?, ?, ?, ?)',
      [firstName, lastName, dob, email, hashedPassword]
    );

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error registering user' });
  }
});

// Login endpoint
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide both email and password' });
  }

  // Returning the same message for "no such user" and "wrong password" stops
  // login from being a free oracle for enumerating which emails are
  // registered. (We still 401 either way; the body is constant-text.)
  const GENERIC_LOGIN_ERROR = 'Invalid email or password';

  try {
    // Retrieve user from the database (only the columns we actually need)
    const [users] = await db.query('SELECT id, password, user_role FROM users WHERE email = ?', [email]);
    const user = users[0];

    if (!user) {
      // Burn a constant amount of CPU on the "no such user" branch so the
      // response timing doesn't itself reveal whether the email exists.
      // bcrypt.compare against a known-bad hash takes the same time as a
      // real verify at the same cost factor.
      await bcrypt.compare(password, '$2b$10$abcdefghijklmnopqrstuuOzPK0YJsRZ0lE7zX2vQRwXh3PZQQjEPq');
      return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    }

    // Rotate the session ID on successful login to prevent session
    // fixation: an attacker who planted their own session cookie on the
    // victim (e.g. via XSS on a sister site) can't ride it into the
    // authenticated session because express-session issues a fresh ID
    // after regenerate(). The userId + userRole are written on the
    // NEW session.
    await new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())));

    req.session.userId = user.id;
    req.session.userRole = user.user_role;
    res.json({ message: 'Login successful', role: user.user_role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error logging in user' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      // Log the error and send an appropriate response
      console.error('Error logging out', err);
      return res.status(500).json({ message: 'Error logging out' });
    }

    // Clear the session cookie
    /*
    Session cookie name is set as follows. Default session cookie name
    used by `express-session` is connect.sid.
    app.use(session({
      // ... other settings ...
      name: 'someAppSession', // custom cookie name
      // ... other settings ...
      }));
    */
    res.clearCookie('connect.sid', { path: '/', httpOnly: true });
    // Send a successful logout response
    res.status(200).json({ message: 'Logout successful' });
  });
});


module.exports = router;
