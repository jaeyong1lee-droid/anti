const sqlite3 = require('sqlite3');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log("=== ENV variables ===");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Exists" : "Does not exist");

// 1. Check local SQLite spaced_repetition.db
console.log("\n=== Checking local SQLite (spaced_repetition.db) ===");
const sqliteDbPath = path.resolve(__dirname, 'spaced_repetition.db');
if (fs.existsSync(sqliteDbPath)) {
  const db = new sqlite3.Database(sqliteDbPath);
  db.all("SELECT key, LENGTH(value) as len, updated_at FROM app_session ORDER BY updated_at DESC LIMIT 20", [], (err, rows) => {
    if (err) {
      console.error("SQLite error:", err.message);
    } else {
      console.log("SQLite app_session rows:");
      console.log(rows);
    }
    db.close();
  });
} else {
  console.log("SQLite file spaced_repetition.db does not exist.");
}

// 2. Check local SQLite db_volume/spaced_repetition.db
console.log("\n=== Checking local SQLite (db_volume/spaced_repetition.db) ===");
const sqliteDbPath3 = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');
if (fs.existsSync(sqliteDbPath3)) {
  const db = new sqlite3.Database(sqliteDbPath3);
  db.all("SELECT key, LENGTH(value) as len, updated_at FROM app_session ORDER BY updated_at DESC LIMIT 20", [], (err, rows) => {
    if (err) {
      console.error("SQLite 3 error:", err.message);
    } else {
      console.log("SQLite 3 app_session rows:");
      console.log(rows);
    }
    db.close();
  });
} else {
  console.log("SQLite file db_volume/spaced_repetition.db does not exist.");
}
