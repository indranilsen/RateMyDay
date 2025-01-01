// Load environment variables in .env files
require('dotenv').config({
  path: process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev'
});

const crypto = require('crypto');
const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cors = require('cors');
const session = require('express-session');

// Import your db and sessionStore from db.js
const { db, sessionStore } = require('./db');

const initializeDatabase = require('./init-db');

// Routers
const usersRouter = require('./routes/users');
const ratingsRouter = require('./routes/ratings');
const settingsRouter = require('./routes/settings');
const adminRouter = require('./routes/admin');

const app = express();
const port = process.env.PORT || 3001;

// Middleware for parsing request bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure morgan for logging
app.use(morgan('combined'));

// CORS Configuration
console.log("Allowing requests from origin: " + process.env.CORS_ORIGIN)
app.use(cors({
  origin: process.env.CORS_ORIGIN, // Allow requests from this origin
  credentials: true // Enable credentials for CORS requests
}));

// Session configuration
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === '') {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.log('Creating new session secret')
}

app.use(session({
  secret: sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: 'auto', // cookie is secure in HTTPS environments
    httpOnly: true,
    maxAge: 2 * 60 * 60 * 1000 // Sets the cookie expiration to 2 hours
  }
}));

// Database initialization
initializeDatabase();

// Use routers
let endpointPrefix = process.env.ENDPOINT_PREFIX;
console.log("Using endpoint prefix: " + endpointPrefix);
app.use(endpointPrefix + 'api/users', usersRouter);
app.use(endpointPrefix + 'api/ratings', ratingsRouter);
app.use(endpointPrefix + 'api/settings', settingsRouter);
app.use(endpointPrefix + 'api/admin', adminRouter);

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

require('./reminder-task');