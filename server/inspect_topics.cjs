const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, './db_volume/spaced_repetition.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, title, keywords FROM topics", [], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('Topics:', rows.map(r => `${r.id}: ${r.title}`));
  
  // Let's dump all rows from schedules to see completed sessions
  db.all("SELECT id, topic_id, status, score FROM schedules", [], (err2, schedules) => {
    if (err2) return;
    console.log('Schedules:', schedules);
  });
});
