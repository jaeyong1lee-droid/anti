const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('server/spaced_repetition.db');
db.all(`SELECT key, updated_at FROM app_session 
        WHERE key LIKE 'review_questions_schedule_%' 
           OR key LIKE 'review_questions_topic_%' 
           OR key LIKE 'completed_review_schedule_%' 
        ORDER BY updated_at DESC LIMIT 5;`, [], (err, rows) => {
  if (err) console.error(err);
  console.log(rows);
});
