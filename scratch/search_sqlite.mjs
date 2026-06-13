import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`DB does not exist: ${dbPath}`);
    return;
  }
  console.log(`\n=== Querying SQLite DB: ${dbPath} ===`);
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve) => {
    db.all("SELECT id, title FROM topics", [], (err, topics) => {
      if (err) {
        console.error("Topics error:", err.message);
      } else {
        console.log("Topics found:", topics);
      }
      
      db.all("SELECT key FROM app_session", [], async (err, sessions) => {
        if (err) {
          console.error("Sessions error:", err.message);
          db.close(() => resolve());
          return;
        }
        console.log("Sessions found:", sessions.map(s => s.key));

        for (const s of sessions) {
          if (s.key.includes('review_questions_') || s.key.includes('completed_review_')) {
            await new Promise((resSession) => {
              db.get("SELECT value FROM app_session WHERE key = ?", [s.key], (err, row) => {
                if (row && row.value) {
                  try {
                    const parsed = JSON.parse(row.value);
                    const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
                    console.log(`\nSession ${s.key} has ${questions.length} questions:`);
                    questions.forEach((q, idx) => {
                      if (q.question && (q.question.includes('Gouy') || q.question.includes('이중층') || q.question.includes('tableborder'))) {
                        console.log(`  [Q${idx+1}] Type: ${q.type}`);
                        console.log(`  Question text: ${q.question.substring(0, 150)}...`);
                        console.log(`  tableData:`, q.tableData);
                      }
                    });
                  } catch (e) {
                    console.error(`Error parsing session ${s.key}:`, e.message);
                  }
                }
                resSession();
              });
            });
          }
        }
        db.close(() => resolve());
      });
    });
  });
}

async function main() {
  const path1 = path.resolve(__dirname, '../server/spaced_repetition.db');
  const path2 = path.resolve(__dirname, '../server/db_volume/spaced_repetition.db');
  
  await checkDb(path1);
  await checkDb(path2);
}

main();
