import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`File does not exist: ${dbPath}`);
    return null;
  }
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error(`Error opening ${dbPath}:`, err.message);
        resolve(null);
        return;
      }
      
      db.all("SELECT name FROM sqlite_master WHERE type='table';", (tableErr, tables) => {
        if (tableErr) {
          console.error(`Error reading tables in ${dbPath}:`, tableErr.message);
          db.close();
          resolve(null);
          return;
        }
        
        console.log(`\n--- DB File: ${path.basename(dbPath)} ---`);
        console.log("Tables:", tables.map(t => t.name));
        
        db.get("SELECT COUNT(*) AS count FROM topics;", (topicsErr, topicsCount) => {
          const topics = topicsErr ? "Table not found" : topicsCount.count;
          db.get("SELECT COUNT(*) AS count FROM schedules;", (schedErr, schedCount) => {
            const schedules = schedErr ? "Table not found" : schedCount.count;
            db.get("SELECT COUNT(*) AS count FROM app_session;", (sessionErr, sessionCount) => {
              const sessions = sessionErr ? "Table not found" : sessionCount.count;
              
              console.log(`Topics count: ${topics}`);
              console.log(`Schedules count: ${schedules}`);
              console.log(`App Sessions count: ${sessions}`);
              
              // If there are topics, let's log the titles of the first 5 topics
              if (topics > 0) {
                db.all("SELECT id, title, created_at FROM topics LIMIT 5;", (listErr, rows) => {
                  if (!listErr) {
                    console.log("Sample Topics:", rows);
                  }
                  db.close();
                  resolve({ path: dbPath, count: topics });
                });
              } else {
                db.close();
                resolve({ path: dbPath, count: topics });
              }
            });
          });
        });
      });
    });
  });
}

async function run() {
  const db1 = path.resolve(__dirname, 'spaced_repetition.db');
  const db2 = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');
  
  await checkDb(db1);
  await checkDb(db2);
}

run();
