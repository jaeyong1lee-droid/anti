const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const dbPath = path.resolve(__dirname, 'spaced_repetition.db');
const connectionString = process.env.DATABASE_URL || 
                         process.env.POSTGRES_URL || 
                         process.env.POSTGRES_PRISMA_URL ||
                         process.env.SUPABASE_DATABASE_URL ||
                         '';

async function checkPostgres() {
  if (!connectionString) {
    console.log("No Postgres connection string found.");
    return;
  }
  console.log("\n=== Checking Postgres Database ===");
  const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const { rows: topics } = await pool.query("SELECT id, title FROM topics");
    console.log("Postgres Topics:", topics);

    const { rows: sessions } = await pool.query("SELECT key, value FROM app_session");
    console.log("Postgres Session keys:", sessions.map(s => s.key));

    for (const s of sessions) {
      if (s.key.includes('review_questions_') || s.key.includes('completed_review_')) {
        try {
          const parsed = JSON.parse(s.value);
          const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
          console.log(`\nPostgres Session ${s.key} has ${questions.length} questions:`);
          questions.forEach((q, idx) => {
            if (q.question && (q.question.includes('Gouy') || q.question.includes('이중층') || q.question.includes('tableborder'))) {
              console.log(`  [Q${idx+1}] Type: ${q.type}`);
              console.log(`  Question: ${q.question.substring(0, 150)}...`);
              console.log(`  tableData:`, q.tableData);
            }
          });
        } catch (e) {
          console.error(`Error parsing session ${s.key}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error("Postgres error:", e.message);
  } finally {
    await pool.end();
  }
}

async function checkSQLite() {
  if (!fs.existsSync(dbPath)) {
    console.log("SQLite database does not exist at:", dbPath);
    return;
  }
  console.log("\n=== Checking SQLite Database ===");
  const db = new sqlite3.Database(dbPath);

  return new Promise((resolve) => {
    db.all("SELECT id, title FROM topics", (err, topics) => {
      if (err) {
        console.error("SQLite topics error:", err.message);
      } else {
        console.log("SQLite Topics:", topics);
      }

      db.all("SELECT key, value FROM app_session", (err, sessions) => {
        if (err) {
          console.error("SQLite sessions error:", err.message);
          db.close(() => resolve());
          return;
        }
        console.log("SQLite Session keys:", sessions.map(s => s.key));

        for (const s of sessions) {
          if (s.key.includes('review_questions_') || s.key.includes('completed_review_')) {
            try {
              const parsed = JSON.parse(s.value);
              const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
              console.log(`\nSQLite Session ${s.key} has ${questions.length} questions:`);
              questions.forEach((q, idx) => {
                if (q.question && (q.question.includes('Gouy') || q.question.includes('이중층') || q.question.includes('tableborder'))) {
                  console.log(`  [Q${idx+1}] Type: ${q.type}`);
                  console.log(`  Question: ${q.question.substring(0, 150)}...`);
                  console.log(`  tableData:`, q.tableData);
                }
              });
            } catch (e) {
              console.error(`Error parsing session ${s.key}:`, e.message);
            }
          }
        }
        db.close(() => resolve());
      });
    });
  });
}

async function main() {
  await checkPostgres();
  await checkSQLite();
}

main();
