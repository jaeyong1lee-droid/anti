import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath1 = path.resolve(__dirname, '..', 'server', 'spaced_repetition.db');
const dbPath2 = path.resolve(__dirname, '..', 'server', 'db_volume', 'spaced_repetition.db');

function queryAll(dbPath, sql) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      db.all(sql, [], (queryErr, rows) => {
        db.close();
        if (queryErr) reject(queryErr);
        else resolve(rows);
      });
    });
  });
}

async function run() {
  try {
    console.log("=== DB 1 (server/spaced_repetition.db) Schedules ===");
    const rows1 = await queryAll(dbPath1, "SELECT s.id, t.title, s.review_round, s.planned_date, s.status FROM schedules s JOIN topics t ON s.topic_id = t.id");
    console.table(rows1);

    console.log("\n=== DB 2 (server/db_volume/spaced_repetition.db) Schedules ===");
    const rows2 = await queryAll(dbPath2, "SELECT s.id, t.title, s.review_round, s.planned_date, s.status FROM schedules s JOIN topics t ON s.topic_id = t.id");
    console.table(rows2);
  } catch (err) {
    console.error(err);
  }
}

run();
