import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');
console.log("Connecting to SQLite database at:", dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("Failed to connect to SQLite:", err);
    return;
  }
  
  db.all("SELECT id, title FROM topics", [], (err, topics) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("=== SQLite Topics ===");
    console.table(topics);
    
    db.all("SELECT id, topic_id, review_round, planned_date, completed_at, status, score FROM schedules ORDER BY topic_id ASC, review_round ASC", [], (err, schedules) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("=== SQLite Schedules ===");
      console.table(schedules);
      db.close();
    });
  });
});
