const { db } = require('./db'); 

const createUserTable = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  dob DATE NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const createRatingsTable = `
CREATE TABLE IF NOT EXISTS ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  rating_date DATE NOT NULL,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  note TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, rating_date)
);
`;

const createSettingsTable = `
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  setting_name VARCHAR(255) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, setting_name)
);
`;

async function initializeDatabase() {
  try {
    await db.query(createUserTable);
    console.log('Users table created or verified successfully');

    await db.query(createRatingsTable);
    console.log('Ratings table created or verified successfully');

    await db.query(createSettingsTable);
    console.log('Settings table created or verified successfully');
  } catch (err) {
    console.error('Error during database initialization', err);
  }
}

module.exports = initializeDatabase;
