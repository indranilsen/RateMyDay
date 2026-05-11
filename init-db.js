// Thin delegate — the chosen backend (see ./db.js) owns the schema bootstrap.
const { initializeDatabase } = require('./db');

module.exports = initializeDatabase;
