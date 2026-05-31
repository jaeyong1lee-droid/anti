import Database from 'better-sqlite3';
const db = new Database('spaced_repetition.db');
const rows = db.prepare(`SELECT id, title, created_at, review_questions FROM topics WHERE title LIKE '%평사투영%'`).all();
console.log(JSON.stringify(rows, null, 2));
