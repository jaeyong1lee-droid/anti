import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');

const db = new sqlite3.Database(dbPath);

db.all(`SELECT key, length(value) as len FROM app_session`, [], (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(`Found ${rows.length} SQLite session records:`);
  
  // Find key containing questions
  db.all(`SELECT key, value FROM app_session WHERE key LIKE '%questions%'`, [], (err, qRows) => {
    if (err) {
      console.error(err);
      return;
    }
    qRows.forEach(row => {
      console.log('----------------------------------------------------');
      console.log('Key:', row.key);
      try {
        const parsed = JSON.parse(row.value);
        let items = [];
        if (Array.isArray(parsed)) {
          items = parsed;
        } else if (parsed && typeof parsed === 'object') {
          // If it's an object, check common properties
          items = parsed.questions || parsed.answersheetQuestions || [];
        }
        
        console.log(`Parsed ${items.length} items.`);
        items.forEach((q, idx) => {
          if ((q.question && q.question.includes('침투')) || (q.title && q.title.includes('침투'))) {
            console.log(`[Match Question ${idx + 1}] Type: ${q.type}`);
            console.log('Question Text:', q.question);
            console.log('tableData:', q.tableData);
            console.log('answers:', q.answers);
          }
        });
      } catch (e) {
        console.log('Failed to parse:', e.message);
      }
    });
    db.close();
  });
});
