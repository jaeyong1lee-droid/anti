const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = 'c:/Users/airfo/OneDrive/바탕 화면/안티/server/spaced_repetition.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("SELECT name FROM sqlite_master WHERE type='table';", (err, tables) => {
    if (err) return console.error(err);
    
    tables.forEach(({ name: tableName }) => {
      db.all(`PRAGMA table_info(${tableName})`, [], (infoErr, cols) => {
        if (infoErr) return;
        cols.forEach(col => {
          const colName = col.name;
          const query = `SELECT * FROM ${tableName} WHERE CAST(${colName} AS TEXT) LIKE '%축차응력%' LIMIT 10;`;
          db.all(query, [], (queryErr, rows) => {
            if (queryErr) return;
            if (rows.length > 0) {
              console.log(`\n=== Match in Table: ${tableName}, Column: ${colName} ===`);
              rows.forEach((row, idx) => {
                console.log(`[Row ${idx + 1}]`);
                if (row.question) console.log('Question:', row.question);
                if (row.explanation) console.log('Explanation:', row.explanation);
                if (row.formula) console.log('Formula:', row.formula);
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
