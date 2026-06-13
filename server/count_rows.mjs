import pg from 'pg';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

async function checkPostgres() {
  console.log('=== POSTGRES TABLE COUNTS ===');
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    const tables = ['topics', 'answersheet_reports', 'schedules', 'app_session', 'question_feedback', 'question_adjustments'];
    for (const t of tables) {
      try {
        const res = await pool.query(`SELECT COUNT(*) FROM ${t}`);
        console.log(`Postgres table ${t}: ${res.rows[0].count} rows`);
      } catch (e) {
        console.log(`Postgres table ${t}: error ${e.message}`);
      }
    }
  } catch (err) {
    console.error('Postgres error:', err);
  } finally {
    await pool.end();
  }
}

async function checkSqlite(dbPath) {
  console.log(`=== SQLITE TABLE COUNTS: ${dbPath} ===`);
  if (!fs.existsSync(dbPath)) {
    console.log('File does not exist.');
    return;
  }
  const db = new sqlite3.Database(dbPath);
  const tables = ['topics', 'answersheet_reports', 'schedules', 'app_session', 'question_feedback', 'question_adjustments'];
  for (const t of tables) {
    await new Promise((resolve) => {
      db.get(`SELECT COUNT(*) as cnt FROM ${t}`, [], (err, row) => {
        if (err) {
          console.log(`Sqlite table ${t}: error ${err.message}`);
        } else {
          console.log(`Sqlite table ${t}: ${row.cnt} rows`);
        }
        resolve();
      });
    });
  }
  db.close();
}

async function main() {
  await checkPostgres();
  await checkSqlite(path.resolve(__dirname, 'spaced_repetition.db'));
  await checkSqlite(path.resolve(__dirname, 'db_volume/spaced_repetition.db'));
}

main();
