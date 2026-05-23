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

// Registration endpoint
router.post('/register', async (req, res) => {
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

  try {
    // Retrieve user from the database (only the columns we actually need)
    const [users] = await db.query('SELECT id, password, user_role FROM users WHERE email = ?', [email]);
    const user = users[0];

    if (!user) {
      return res.status(401).json({ message: 'User does not exist' });
    }

    // Verify the password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Start a session. Stash the user_role on the session so the admin
    // middleware can authorize without an extra DB roundtrip on every
    // admin request (it now falls back to a DB read only for sessions
    // that predate this change, i.e. existing sessions whose row was
    // serialized before we started storing role).
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
