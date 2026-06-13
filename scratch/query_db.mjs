import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../server/db_volume/spaced_repetition.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT key, value FROM app_session WHERE value LIKE '%Chapman%'", [], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('Found', rows.length, 'matching rows');
  rows.forEach((r, idx) => {
    console.log(`=== ROW ${idx}: key = ${r.key} ===`);
    try {
      const parsed = JSON.parse(r.value);
      console.log('Parsed type:', typeof parsed, Array.isArray(parsed) ? 'Array' : 'Object');
      const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
      questions.forEach((q, qIdx) => {
        if (q.question && q.question.includes('Chapman')) {
          console.log(`Question ${qIdx}:`);
          console.log(JSON.stringify(q, null, 2));
        }
      });
    } catch (e) {
      console.log('Failed to parse JSON:', e.message);
      console.log(r.value.substring(0, 1000));
    }
  });
  db.close();
});
