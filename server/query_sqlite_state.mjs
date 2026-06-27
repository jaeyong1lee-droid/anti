import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
});

db.serialize(() => {
  console.log("--- 20 LATEST SCHEDULES (SQLITE) ---");
  db.all("SELECT id, topic_id, review_round, planned_date, completed_at, status, score FROM schedules ORDER BY id DESC LIMIT 20", [], (err, rows) => {
    if (err) console.error(err);
    else console.table(rows);

    console.log("\n--- 20 LATEST APP_SESSION KEYS (SQLITE) ---");
    db.all("SELECT key, updated_at FROM app_session ORDER BY updated_at DESC LIMIT 20", [], (err, rows2) => {
      if (err) console.error(err);
      else console.table(rows2);
      db.close();
    });
  });
});
