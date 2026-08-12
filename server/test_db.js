import Database from 'better-sqlite3';
const db = new Database('database.sqlite');
const rows = db.prepare(`SELECT question, explanation FROM questions WHERE question LIKE '%쌍곡선%' OR explanation LIKE '%쌍곡선%';`).all();
rows.forEach(row => {
  console.log('--- QUESTION ---');
  console.log(row.question);
  console.log('--- EXPLANATION ---');
  console.log(row.explanation);
});
db.close();
