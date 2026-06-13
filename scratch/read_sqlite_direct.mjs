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
    db.all("SELECT * FROM app_session", [], (err, rows) => {
      if (err) {
        console.error("Query error:", err.message);
      } else {
        console.log(`Found ${rows.length} rows in app_session.`);
        for (const row of rows) {
          console.log(`- KEY: ${row.key} (length: ${row.value ? row.value.length : 0})`);
          if (row.key === 'formula_questions') {
            try {
              const parsed = JSON.parse(row.value);
              const qList = parsed.formulaQuestions || parsed;
              console.log(`  formulaQuestions has ${qList.length} items.`);
              qList.forEach((q, i) => {
                console.log(`  [${i+1}] Title: ${q.title}`);
                console.log(`      Formula snippet: ${q.formula ? q.formula.substring(0, 100) : 'none'}`);
              });
            } catch (e) {
              console.log(`  Failed to parse JSON for formula_questions: ${e.message}`);
            }
          }
        }
      }
      db.close(() => resolve());
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
