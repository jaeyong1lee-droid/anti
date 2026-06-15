import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = './db_volume/spaced_repetition.db';

if (!fs.existsSync(dbPath)) {
  console.error('Database file not found at:', dbPath);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
});

db.serialize(() => {
  db.all("SELECT name FROM sqlite_master WHERE type='table';", (err, tables) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log('Tables:', tables.map(t => t.name));
    
    tables.forEach(({ name: tableName }) => {
      db.all(`PRAGMA table_info(${tableName})`, [], (infoErr, cols) => {
        if (infoErr) return;
        
        cols.forEach(col => {
          const colName = col.name;
          const query = `SELECT * FROM ${tableName} WHERE CAST(${colName} AS TEXT) LIKE '%d_{H,max1}%' LIMIT 5;`;
          db.all(query, [], (queryErr, rows) => {
            if (queryErr) return;
            if (rows.length > 0) {
              console.log(`\n=== Match in Table: ${tableName}, Column: ${colName} ===`);
              rows.forEach((row, idx) => {
                console.log(`[Row ${idx + 1}]`);
                console.log(JSON.stringify(row, null, 2));
              });
            }
          });
        });
      });
    });
  });
});

setTimeout(() => {
  db.close();
}, 2000);
