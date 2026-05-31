const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('spaced_repetition.db');
db.all('SELECT id FROM topics LIMIT 1', (err, rows) => { 
  if (err) console.error(err);
  console.log(rows); 
});
