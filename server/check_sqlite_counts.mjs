import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');

console.log("Connecting to SQLite database at:", dbPath);
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("Error opening SQLite database:", err.message);
    return;
  }
  
  db.serialize(() => {
    db.get("SELECT COUNT(*) as count FROM topics", [], (err, row) => {
      if (err) console.error(err);
      else console.log("Topics count in SQLite:", row.count);
    });

    db.get("SELECT COUNT(*) as count FROM schedules", [], (err, row) => {
      if (err) console.error(err);
      else console.log("Schedules count in SQLite:", row.count);
    });

    db.all("SELECT id, title FROM topics LIMIT 5", [], (err, rows) => {
      if (err) console.error(err);
      else console.log("Sample topics in SQLite:", rows);
    });
  });
});
