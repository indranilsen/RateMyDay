// Backend selector. Default is MySQL (production). Override with DB_BACKEND=sqlite
// for local dev — runs entirely in-process via better-sqlite3, no external services.
// The chosen backend is required lazily so the unused one's deps aren't loaded.
const backendName = process.env.DB_BACKEND === 'sqlite' ? 'sqlite' : 'mysql';
console.log(`[DB] Using backend: ${backendName}`);
module.exports = require(`./db/${backendName}`);
