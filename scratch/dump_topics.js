import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '..', 'server', 'db_volume', 'spaced_repetition.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  db.all('SELECT id, title, keywords FROM topics', (err, rows) => {
    if (err) {
      console.error('Error querying topics:', err);
      return;
    }
    console.log('=== Topics ===');
    console.log(JSON.stringify(rows, null, 2));
    
    // Also, query schedules
    db.all('SELECT * FROM schedules', (err, scheds) => {
      if (err) {
        console.error('Error querying schedules:', err);
        return;
      }
      console.log('=== Schedules ===');
      console.log(JSON.stringify(scheds, null, 2));
      db.close();
    });
  });
});
