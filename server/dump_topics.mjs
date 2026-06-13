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

async function dumpPostgres() {
  console.log('=== POSTGRES TOPICS ===');
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    const res = await pool.query(`SELECT id, title, keywords, pdf_name FROM topics`);
    res.rows.forEach(r => {
      console.log(`ID: ${r.id}, Title: ${r.title}, PDF: ${r.pdf_name}`);
      console.log(`  Keywords:`, r.keywords ? r.keywords.substring(0, 300) : null);
    });
  } catch (err) {
    console.error('Postgres error:', err);
  } finally {
    await pool.end();
  }
}

async function dumpSqlite(dbPath) {
  console.log(`=== SQLITE TOPICS: ${dbPath} ===`);
  if (!fs.existsSync(dbPath)) {
    console.log('File does not exist.');
    return;
  }
  const db = new sqlite3.Database(dbPath);
  await new Promise((resolve) => {
    db.all(`SELECT id, title, keywords, pdf_name FROM topics`, [], (err, rows) => {
      if (err) {
        console.log('Error:', err.message);
      } else {
        rows.forEach(r => {
          console.log(`ID: ${r.id}, Title: ${r.title}, PDF: ${r.pdf_name}`);
          console.log(`  Keywords:`, r.keywords ? r.keywords.substring(0, 300) : null);
        });
      }
      resolve();
    });
  });
  db.close();
}

async function main() {
  await dumpPostgres();
  await dumpSqlite(path.resolve(__dirname, 'spaced_repetition.db'));
  await dumpSqlite(path.resolve(__dirname, 'db_volume/spaced_repetition.db'));
}

main();
