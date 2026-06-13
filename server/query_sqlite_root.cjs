const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'spaced_repetition.db');

if (!fs.existsSync(dbPath)) {
  console.log('SQLite database file does not exist at:', dbPath);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite DB:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite Database.');

  db.all("SELECT id, title FROM topics ORDER BY id ASC", (err, rows) => {
    if (err) {
      console.error(err);
    } else {
      console.log('SQLite Topics:', rows.map(r => ({ id: r.id, title: r.title })));
    }
    db.close();
  });
});
