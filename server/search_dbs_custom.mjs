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

async function searchPostgres(keyword) {
  console.log(`=== SEARCHING POSTGRESQL FOR: ${keyword} ===`);
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    const tablesRes = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const tables = tablesRes.rows.map(r => r.table_name);

    for (const table of tables) {
      const colsRes = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND data_type IN ('text', 'character varying', 'json', 'jsonb')
      `, [table]);
      const cols = colsRes.rows.map(c => c.column_name);
      
      for (const col of cols) {
        try {
          const matchRes = await pool.query(`SELECT COUNT(*) FROM ${table} WHERE "${col}"::text LIKE $1`, [`%${keyword}%`]);
          const count = parseInt(matchRes.rows[0].count, 10);
          if (count > 0) {
            console.log(`  Match found in PG table: ${table}, column: ${col} (Count: ${count})`);
            const rowsRes = await pool.query(`SELECT * FROM ${table} WHERE "${col}"::text LIKE $1 LIMIT 5`, [`%${keyword}%`]);
            rowsRes.rows.forEach(row => {
              console.log(`    Row details:`, JSON.stringify(row).substring(0, 1000));
            });
          }
        } catch (e) {
          // ignore
        }
      }
    }
  } catch (err) {
    console.error('Postgres search error:', err);
  } finally {
    await pool.end();
  }
}

function searchSqliteFile(dbPath, keyword) {
  return new Promise((resolve) => {
    console.log(`=== SEARCHING SQLITE FOR ${keyword}: ${dbPath} ===`);
    if (!fs.existsSync(dbPath)) {
      console.log('File does not exist.');
      resolve();
      return;
    }
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Failed to open sqlite:', err.message);
        resolve();
        return;
      }
    });

    db.serialize(() => {
      db.all("SELECT name FROM sqlite_master WHERE type='table'", [], async (err, tables) => {
        if (err) {
          db.close();
          resolve();
          return;
        }
        const tableNames = tables.map(t => t.name);

        for (const table of tableNames) {
          db.all(`PRAGMA table_info(${table})`, [], (infoErr, cols) => {
            if (infoErr) return;
            const textCols = cols.filter(c => ['TEXT', 'BLOB', ''].includes(c.type.toUpperCase())).map(c => c.name);
            
            textCols.forEach(col => {
              db.all(`SELECT * FROM ${table} WHERE CAST(${col} AS TEXT) LIKE ?`, [`%${keyword}%`], (matchErr, rows) => {
                if (matchErr) return;
                if (rows && rows.length > 0) {
                  console.log(`  Match in SQLite -> Table: ${table}, Col: ${col} (Count: ${rows.length})`);
                  rows.forEach(r => {
                    console.log(`    Row:`, JSON.stringify(r).substring(0, 1000));
                  });
                }
              });
            });
          });
        }
        setTimeout(() => {
          db.close();
          resolve();
        }, 1000);
      });
    });
  });
}

async function main() {
  const keyword = 'sigma_1';
  await searchPostgres(keyword);
  await searchSqliteFile(path.resolve(__dirname, 'spaced_repetition.db'), keyword);
  await searchSqliteFile(path.resolve(__dirname, 'db_volume/spaced_repetition.db'), keyword);
}

main();
