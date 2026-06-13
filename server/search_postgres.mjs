import pg from 'pg';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

async function searchPostgres() {
  console.log('=== SEARCHING POSTGRESQL ===');
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    const topicsRes = await pool.query("SELECT id, title FROM topics WHERE title LIKE '%k_x%' OR title LIKE '%kx%' OR keywords LIKE '%k_x%' OR keywords LIKE '%kx%'");
    console.log('Postgres topics matches:', topicsRes.rows);

    const sessionRes = await pool.query("SELECT key FROM app_session WHERE value LIKE '%k_x%' OR value LIKE '%kx%' OR value LIKE '%eq%'");
    console.log('Postgres app_session matches:', sessionRes.rows.map(r => r.key));

    for (const row of sessionRes.rows) {
      const fullRes = await pool.query("SELECT key, value FROM app_session WHERE key = $1", [row.key]);
      const val = fullRes.rows[0].value;
      let idx = -1;
      while ((idx = val.indexOf('eq', idx + 1)) !== -1) {
        console.log(`  [Postgres] Key ${row.key} Context around index ${idx}:`, val.substring(Math.max(0, idx - 45), Math.min(val.length, idx + 45)));
      }
    }
  } catch (err) {
    console.error('Postgres error:', err);
  } finally {
    await pool.end();
  }
}

async function searchSqlite() {
  console.log('=== SEARCHING SQLITE ===');
  const dbPath = path.resolve(__dirname, 'spaced_repetition.db');
  const db = new sqlite3.Database(dbPath);
  return new Promise((resolve) => {
    db.serialize(() => {
      db.all("SELECT id, title FROM topics WHERE title LIKE '%k_x%' OR title LIKE '%kx%' OR keywords LIKE '%k_x%' OR keywords LIKE '%kx%'", [], (err, rows) => {
        if (err) console.error('Sqlite topics error:', err);
        else console.log('Sqlite topics matches:', rows);
      });

      db.all("SELECT key, value FROM app_session WHERE value LIKE '%k_x%' OR value LIKE '%kx%' OR value LIKE '%eq%'", [], (err, rows) => {
        if (err) {
          console.error('Sqlite app_session error:', err);
        } else {
          console.log('Sqlite app_session matches keys:', rows.map(r => r.key));
          rows.forEach(row => {
            const val = row.value;
            let idx = -1;
            while ((idx = val.indexOf('eq', idx + 1)) !== -1) {
              console.log(`  [Sqlite] Key ${row.key} Context around index ${idx}:`, val.substring(Math.max(0, idx - 45), Math.min(val.length, idx + 45)));
            }
          });
        }
        db.close();
        resolve();
      });
    });
  });
}

async function main() {
  await searchPostgres();
  await searchSqlite();
}

main();
