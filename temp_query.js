const db = require('./server/db');
db.query("SELECT * FROM questions WHERE question_text LIKE '%침투수량%'")
  .then(res => console.log(JSON.stringify(res.rows, null, 2)))
  .catch(console.error)
  .finally(()=>process.exit(0));
