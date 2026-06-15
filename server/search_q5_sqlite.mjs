import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');

const db = new sqlite3.Database(dbPath);

console.log('Searching in SQLite db at:', dbPath);

db.serialize(() => {
  // Find tables
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log('Tables:', tables.map(t => t.name));
    
    // Search in topics
    db.all("SELECT id, title FROM topics WHERE title LIKE '%침투%'", [], (err, topics) => {
      if (err) {
        console.error(err);
      } else {
        console.log(`Found ${topics.length} topics matching '침투':`);
        topics.forEach(t => console.log(`  ID: ${t.id}, Title: ${t.title}`));
      }
    });

    // Search in app_session
    db.all("SELECT key, value FROM app_session", [], (err, sessions) => {
      if (err) {
        console.error('app_session query error:', err.message);
        return;
      }
      console.log(`Total sessions in app_session: ${sessions.length}`);
      
      let matchesCount = 0;
      sessions.forEach(row => {
        if (row.value && (row.value.includes('침투') || row.value.includes('평가 지표') || row.value.includes('한계 동수경사'))) {
          console.log(`\nMatch found in session key: ${row.key}`);
          try {
            const parsed = JSON.parse(row.value);
            const questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.answersheetQuestions || []);
            console.log(`Session contains ${questions.length} questions.`);
            questions.forEach((q, idx) => {
              if (q.question && (q.question.includes('침투') || q.question.includes('평가 지표') || q.question.includes('한계 동수경사'))) {
                matchesCount++;
                console.log(`--- [Q${idx + 1}] ---`);
                console.log(`Type: ${q.type}`);
                console.log(`Question:`, q.question);
                console.log(`tableData:`, JSON.stringify(q.tableData));
                console.log(`answers:`, JSON.stringify(q.answers));
              }
            });
          } catch (e) {
            console.log(`Failed to parse session value: ${e.message}`);
          }
        }
      });
      console.log(`\nTotal matching questions: ${matchesCount}`);
      db.close();
    });
  });
});
