const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

async function main() {
  const dbFile = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');
  console.log(`=== SEARCHING SQLITE: ${dbFile} ===`);
  if (!fs.existsSync(dbFile)) {
    console.log('File does not exist');
    return;
  }
  const db = new sqlite3.Database(dbFile);
  
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error(err);
      return;
    }
    const names = tables.map(t => t.name);
    console.log('Tables:', names);
    
    // Count rows in each table
    names.forEach(table => {
      db.get(`SELECT COUNT(*) as cnt FROM ${table}`, [], (cntErr, row) => {
        if (cntErr) {
          console.log(`- Table ${table}: Error - ${cntErr.message}`);
        } else {
          console.log(`- Table ${table}: ${row.cnt} rows`);
        }
      });
    });
    
    // Search for Poisson's ratio
    db.all("SELECT key, value FROM app_session WHERE value LIKE '%포아송%' OR value LIKE '%Poisson%'", [], (err, rows) => {
      if (err) {
        console.error('app_session query error:', err.message);
        db.close();
        return;
      }
      console.log(`Found ${rows.length} rows in app_session containing Poisson.`);
      rows.forEach((row, i) => {
        console.log(`\n[${i+1}] KEY: ${row.key}`);
        const idx = row.value.indexOf('포아송');
        const idx2 = row.value.indexOf('Poisson');
        const start = Math.max(0, Math.min(idx >= 0 ? idx : Infinity, idx2 >= 0 ? idx2 : Infinity) - 100);
        console.log('Snippet:', row.value.substring(start, start + 600));
      });
      db.close();
    });
  });
}
main();
