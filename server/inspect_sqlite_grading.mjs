import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');

const db = new sqlite3.Database(dbPath);
db.get("SELECT value FROM app_session WHERE key = 'grading_standards'", (err, row) => {
  if (err) {
    console.error(err);
  } else if (row && row.value) {
    const list = JSON.parse(row.value);
    console.log('SQLite Length:', list.length);
    console.log('SQLite Titles:', list.map(item => item.title));
  } else {
    console.log('No grading_standards in SQLite');
  }
  db.close();
});
