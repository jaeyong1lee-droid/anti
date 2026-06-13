import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'spaced_repetition.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log("Tables in server/spaced_repetition.db:", rows.map(r => r.name));
  
  // Also check if app_session exists and list rows if it does
  if (rows.map(r => r.name).includes('app_session')) {
    db.all("SELECT key, updated_at FROM app_session", [], (err, srows) => {
      if (err) console.error(err);
      else {
        console.log(`Found ${srows.length} rows in app_session:`);
        srows.forEach(r => console.log(`- ${r.key}`));
      }
      db.close();
    });
  } else {
    db.close();
  }
});
