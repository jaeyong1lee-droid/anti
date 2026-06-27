const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, './spaced_repetition.db');
if (!fs.existsSync(dbPath)) {
  console.error('Database file not found:', dbPath);
  process.exit(1);
}

console.log('Using database:', dbPath);
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("SELECT name FROM sqlite_master WHERE type='table';", (err, tables) => {
    if (err) {
      console.error(err);
      return;
    }
    
    tables.forEach(({ name: tableName }) => {
      db.all(`PRAGMA table_info(${tableName})`, [], (infoErr, cols) => {
        if (infoErr) return;
        
        cols.forEach(col => {
          const colName = col.name;
          const query = `SELECT * FROM ${tableName} WHERE CAST(${colName} AS TEXT) LIKE '%4계 미분방정식%' LIMIT 10;`;
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
