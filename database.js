const mysql = require('mysql2/promise');

// Connection settings come from your .env file
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5, // hosting plans only allow a few connections per user
  enableKeepAlive: true,
  charset: 'utf8mb4',
});

// Created automatically when the bot starts (nothing happens if they exist).
// If your hosting user is not allowed to create tables, paste these two
// statements into phpMyAdmin once.
// const SCHEMA = [
//   `CREATE TABLE IF NOT EXISTS daily_config (
//     guild_id   VARCHAR(32) NOT NULL,
//     channel_id VARCHAR(32) NULL,
//     PRIMARY KEY (guild_id)
//   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

//   `CREATE TABLE IF NOT EXISTS game_users (
//     guild_id             VARCHAR(32) NOT NULL,
//     user_id              VARCHAR(32) NOT NULL,
//     points               INT NOT NULL DEFAULT 0,
//     correct              INT NOT NULL DEFAULT 0,
//     streak               INT NOT NULL DEFAULT 0,
//     best_streak          INT NOT NULL DEFAULT 0,
//     current_character_id INT NULL,
//     wrong_attempts       INT NOT NULL DEFAULT 0,
//     cooldown_until       BIGINT NULL,
//     recent_ids           TEXT NULL,
//     guessed_counts       TEXT NULL,
//     PRIMARY KEY (guild_id, user_id),
//     INDEX idx_guild_points (guild_id, points)
//   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
// ];

// function hint(error) {
//   switch (error.code) {
//     case 'ECONNREFUSED':
//     case 'ETIMEDOUT':
//     case 'ENOTFOUND':
//       return 'Cannot reach the database server. Check DB_HOST/DB_PORT, and that your hosting allows remote connections from this computer (Remote MySQL / IP whitelist).';
//     case 'ER_ACCESS_DENIED_ERROR':
//       return 'Wrong DB_USER or DB_PASSWORD, or this user is not allowed to connect from your IP address.';
//     case 'ER_BAD_DB_ERROR':
//       return 'The database name in DB_NAME does not exist (hosting often adds a prefix, like user_botdb).';
//     case 'ER_DBACCESS_DENIED_ERROR':
//       return 'This user has no access to that database. Add the user to the database in your hosting panel.';
//     case 'ER_TABLEACCESS_DENIED_ERROR':
//       return 'This user is not allowed to create tables. Paste the CREATE TABLE statements from database.js into phpMyAdmin.';
//     default:
//       return null;
//   }
// }

async function connectToDatabase() {
  const missing = ['DB_HOST', 'DB_USER', 'DB_NAME'].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing in your .env file: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    await pool.query('SELECT 1');
    for (const statement of SCHEMA) await pool.query(statement);
    console.log('Connected to MySQL.');
  } catch (error) {
    console.error(`MySQL connection failed: ${error.code ? `${error.code}: ` : ''}${error.message}`);
    const tip = hint(error);
    if (tip) console.error(tip);
    process.exit(1);
  }
}

// require('./database') is the connect function, so index.js only changes its require line.
module.exports = connectToDatabase;
module.exports.pool = pool;
module.exports.query = (sql, params) => pool.query(sql, params);
module.exports.SCHEMA = SCHEMA;