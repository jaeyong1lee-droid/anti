import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPaths = [
  path.resolve(__dirname, 'db_volume', 'spaced_repetition.db'),
  path.resolve(__dirname, 'anti.db'),
  path.resolve(__dirname, 'database.sqlite'),
  path.resolve(__dirname, 'spaced_repetition.db')
];

for (const p of dbPaths) {
  if (!fs.existsSync(p)) continue;
  const db = new sqlite3.Database(p, sqlite3.OPEN_READONLY);
  db.all("SELECT count(*) as cnt FROM schedules", [], (err, rows) => {
    if (err) {
      console.log(`[SQLite Check] ${p}: No schedules table or error (${err.message})`);
    } else {
      console.log(`[SQLite Check] ${p}: schedules count = ${rows[0].cnt}`);
    }
    db.close();
  });
}
