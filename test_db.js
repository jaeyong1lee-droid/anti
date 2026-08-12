const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('server/database.sqlite');
db.serialize(() => {
  db.each("SELECT question, explanation FROM questions WHERE question LIKE '%쌍곡선%' OR explanation LIKE '%쌍곡선%';", (err, row) => {
    if (err) console.error(err);
    console.log('--- QUESTION ---');
    console.log(row.question);
    console.log('--- EXPLANATION ---');
    console.log(row.explanation);
  });
});
db.close();
