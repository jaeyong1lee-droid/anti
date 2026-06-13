const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbs = [
  path.resolve(__dirname, 'spaced_repetition.db'),
  path.resolve(__dirname, 'db_volume', 'spaced_repetition.db')
];

dbs.forEach(dbPath => {
  if (!fs.existsSync(dbPath)) {
    console.log('Not found:', dbPath);
    return;
  }
  console.log('------------------------------------');
  console.log('Inspecting:', dbPath);
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log('Tables:', tables.map(t => t.name));
      tables.forEach(t => {
        db.get(`SELECT COUNT(*) as count FROM ${t.name}`, (err, row) => {
          if (err) {
            console.error(`Error counting ${t.name}:`, err);
          } else {
            console.log(`Table ${t.name}: ${row.count} rows`);
          }
        });
      });
    });
  });
});
