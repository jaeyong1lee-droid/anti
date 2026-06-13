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

async function searchPostgres() {
  console.log('=== SEARCHING POSTGRESQL ===');
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    // List all tables
    const tablesRes = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log('Postgres tables:', tables);

    for (const table of tables) {
      // Find columns that are text/character/json
      const colsRes = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND data_type IN ('text', 'character varying', 'json', 'jsonb')
      `, [table]);
      const cols = colsRes.rows.map(c => c.column_name);
      
      for (const col of cols) {
        try {
          const matchRes = await pool.query(`SELECT COUNT(*) FROM ${table} WHERE "${col}" LIKE '%이방성%' OR "${col}" LIKE '%kx%' OR "${col}" LIKE '%k_x%'`);
          const count = parseInt(matchRes.rows[0].count, 10);
          if (count > 0) {
            console.log(`  Match found in PG table: ${table}, column: ${col} (Count: ${count})`);
            const rowsRes = await pool.query(`SELECT * FROM ${table} WHERE "${col}" LIKE '%이방성%' OR "${col}" LIKE '%kx%' OR "${col}" LIKE '%k_x%' LIMIT 5`);
            rowsRes.rows.forEach(row => {
              console.log(`    Row details:`, JSON.stringify(row).substring(0, 500));
            });
          }
        } catch (e) {
          // ignore column types that might not support LIKE
        }
      }
    }
  } catch (err) {
    console.error('Postgres search error:', err);
  } finally {
    await pool.end();
  }
}

function searchSqliteFile(dbPath) {
  return new Promise((resolve) => {
    console.log(`=== SEARCHING SQLITE: ${dbPath} ===`);
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
          console.error('Failed to list tables:', err);
          db.close();
          resolve();
          return;
        }
        const tableNames = tables.map(t => t.name);
        console.log(`Tables in ${path.basename(dbPath)}:`, tableNames);

        for (const table of tableNames) {
          db.all(`PRAGMA table_info(${table})`, [], (infoErr, cols) => {
            if (infoErr) return;
            const textCols = cols.filter(c => ['TEXT', 'BLOB', ''].includes(c.type.toUpperCase())).map(c => c.name);
            
            textCols.forEach(col => {
              db.all(`SELECT * FROM ${table} WHERE CAST(${col} AS TEXT) LIKE '%이방성%' OR CAST(${col} AS TEXT) LIKE '%kx%' OR CAST(${col} AS TEXT) LIKE '%k_x%'`, [], (matchErr, rows) => {
                if (matchErr) return;
                if (rows && rows.length > 0) {
                  console.log(`  Match in ${path.basename(dbPath)} -> Table: ${table}, Col: ${col} (Count: ${rows.length})`);
                  rows.forEach(r => {
                    console.log(`    Row:`, JSON.stringify(r).substring(0, 500));
                  });
                }
              });
            });
          });
        }
        
        // Wait a bit and close
        setTimeout(() => {
          db.close();
          resolve();
        }, 1000);
      });
    });
  });
}

async function main() {
  await searchPostgres();
  await searchSqliteFile(path.resolve(__dirname, 'spaced_repetition.db'));
  await searchSqliteFile(path.resolve(__dirname, 'db_volume/spaced_repetition.db'));
}

main();
