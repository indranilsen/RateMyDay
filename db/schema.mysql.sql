CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  dob DATE NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  user_role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  rating_date DATE NOT NULL,
  rating INT CHECK (rating BETWEEN 1 AND 10),
  note TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, rating_date)
);

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  data JSON NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_settings_user_id (user_id)
);

-- Existing pre-Dec-2024 installs need a one-time manual:
--   ALTER TABLE settings ADD UNIQUE KEY uk_settings_user_id (user_id);
-- We can't ship that as auto-applied DDL here because `CREATE INDEX IF NOT
-- EXISTS` requires MySQL 8.0.29+, and prod (8.0.x) parse-errors on the
-- IF NOT EXISTS token. Tried it — it took the server down. The inline
-- UNIQUE KEY in the CREATE TABLE above covers any fresh install going
-- forward; existing installs need the manual ALTER once.
