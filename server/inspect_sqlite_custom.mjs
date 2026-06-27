import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'spaced_repetition.db');

console.log("Connecting to SQLite database at:", dbPath);
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, async (err) => {
  if (err) {
    console.error("Error opening SQLite database:", err.message);
    return;
  }
  
  db.serialize(() => {
    // 1. Show all tables
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("Tables:", tables.map(t => t.name));
      
      // Let's search inside each table for "sigma_1" or "축차응력"
      tables.forEach(t => {
        const tableName = t.name;
        db.all(`PRAGMA table_info(${tableName})`, [], (infoErr, cols) => {
          if (infoErr) return;
          const textCols = cols.map(c => c.name);
          textCols.forEach(col => {
            db.all(`SELECT * FROM ${tableName} WHERE CAST(${col} AS TEXT) LIKE '%sigma_1%' OR CAST(${col} AS TEXT) LIKE '%축차응력%'`, [], (matchErr, rows) => {
              if (matchErr) return;
              if (rows && rows.length > 0) {
                console.log(`\nMatch in SQLite table: ${tableName}, column: ${col} (Count: ${rows.length})`);
                rows.forEach(r => {
                  console.log(`  Row:`, JSON.stringify(r).substring(0, 1500));
                });
              }
            });
          });
        });
      });
    });
  });
});
