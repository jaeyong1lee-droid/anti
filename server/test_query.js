const Database = require('better-sqlite3');
const db = new Database('../spaced_repetition.db');
const row = db.prepare(`SELECT * FROM answersheet_items WHERE question LIKE '%교란되어 수평방향 투수계수%' OR answer LIKE '%교란되어 수평방향 투수계수%' LIMIT 1`).get();
console.log(JSON.stringify(row, null, 2));
