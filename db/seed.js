// Dev-mode seed data for the in-memory SQLite backend.
// Inserted only if the users table is empty so reseeding is safe.
const bcrypt = require('bcryptjs');

async function seed(db) {
  // 1) Idempotent: bail if any users exist
  const [existing] = await db.query('SELECT COUNT(*) AS count FROM users');
  if (existing[0].count > 0) {
    console.log('[Seed] Users already present, skipping seed');
    return;
  }

  console.log('[Seed] Inserting seed data...');
  // bcrypt cost 10 is fine for dev seeds — keeps boot fast
  const adminPass = await bcrypt.hash('admin', 10);
  const userPass = await bcrypt.hash('password', 10);

  // 2) Five users: 1 admin, 1 heavy-data, 1 sparse, 2 empty
  const fakeUsers = [
    { firstName: 'Admin', lastName: 'User',   dob: '1990-01-01', email: 'admin@local.dev', pass: adminPass, role: 'admin' },
    { firstName: 'Alice', lastName: 'Active', dob: '1992-03-15', email: 'alice@local.dev', pass: userPass,  role: 'user' },
    { firstName: 'Bob',   lastName: 'Sparse', dob: '1995-07-22', email: 'bob@local.dev',   pass: userPass,  role: 'user' },
    { firstName: 'Carol', lastName: 'Empty',  dob: '1988-11-30', email: 'carol@local.dev', pass: userPass,  role: 'user' },
    { firstName: 'Dave',  lastName: 'Empty',  dob: '1991-05-10', email: 'dave@local.dev',  pass: userPass,  role: 'user' }
  ];
  for (const u of fakeUsers) {
    await db.query(
      'INSERT INTO users (first_name, last_name, dob, email, password, user_role) VALUES (?, ?, ?, ?, ?, ?)',
      [u.firstName, u.lastName, u.dob, u.email, u.pass, u.role]
    );
  }

  // 3) Look up the IDs we just created so we can attach ratings
  const [users] = await db.query('SELECT id, email FROM users');
  const aliceId = users.find(u => u.email === 'alice@local.dev').id;
  const bobId = users.find(u => u.email === 'bob@local.dev').id;

  // 4) Alice: 30 consecutive days of ratings ending today
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const rating = 4 + Math.floor(Math.random() * 7); // 4..10
    await db.query(
      'INSERT INTO ratings (user_id, rating_date, rating, note) VALUES (?, ?, ?, ?)',
      [aliceId, dateStr, rating, `Seeded rating for ${dateStr}`]
    );
  }

  // 5) Bob: 5 sparse ratings over the last 30 days
  const bobOffsets = [2, 7, 15, 22, 28];
  for (const offset of bobOffsets) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const dateStr = d.toISOString().split('T')[0];
    const rating = 3 + Math.floor(Math.random() * 5); // 3..7
    await db.query(
      'INSERT INTO ratings (user_id, rating_date, rating, note) VALUES (?, ?, ?, ?)',
      [bobId, dateStr, rating, '']
    );
  }

  console.log('[Seed] Seeded 5 users (admin/admin, alice/password, etc.) with sample ratings');
}

module.exports = { seed };
