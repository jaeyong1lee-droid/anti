const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, './db_volume/spaced_repetition.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT key, length(value) as len, updated_at FROM app_session", [], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('App sessions in SQLite:', rows);
});
