import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');

console.log("Connecting to SQLite database at:", dbPath);
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, async (err) => {
  if (err) {
    console.error("Error opening SQLite database:", err.message);
    return;
  }
  
  db.serialize(() => {
    // 1. Show all keys in app_session with their lengths and last updated timestamp
    console.log("--- Current Session Keys in SQLite ---");
    db.all("SELECT key, length(value) as len FROM app_session", [], (err, rows) => {
      if (err) console.error(err);
      else console.table(rows);
    });

    // 2. Inspect 'answersheet_questions' content
    db.get("SELECT key, value FROM app_session WHERE key = 'answersheet_questions'", [], (err, row) => {
      if (err) {
        console.error(err);
      } else if (row) {
        console.log("\n--- Database Session Value for answersheet_questions in SQLite ---");
        const parsed = JSON.parse(row.value);
        const questions = parsed.answersheetQuestions || [];
        console.log("Is answersheetQuestions an array? ", Array.isArray(questions));
        console.log("Array length: ", questions.length);
        
        // Print detailed summary of each topic in answersheet
        questions.forEach((q, index) => {
          console.log(`[${index + 1}] Title: "${q.title}", Formula/Desc: "${q.formula ? q.formula.substring(0, 55) : ''}", Report ID: ${q.answersheet_report_id}`);
        });
      } else {
        console.log("\n[WARNING] No 'answersheet_questions' session found in SQLite!");
      }
    });

    // 3. Check reports count
    db.get("SELECT COUNT(*) as count FROM answersheet_reports", [], (err, row) => {
      if (err) console.error(err);
      else console.log("answersheet_reports count in SQLite:", row.count);
    });
  });
});
