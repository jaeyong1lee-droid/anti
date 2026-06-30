const fs = require('fs');
const path = require('path');

async function checkDb(dbPath) {
  console.log(`Checking SQLite database at: ${dbPath}`);
  if (!fs.existsSync(dbPath)) {
    console.log(' - File does not exist.');
    return;
  }
  try {
    const sqlite3Module = await import('sqlite3');
    const sqlite3 = sqlite3Module.default;
    const localDb = new sqlite3.Database(dbPath);
    
    // List tables
    await new Promise((resolve) => {
      localDb.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
        if (err) {
          console.error('  Failed to list tables:', err.message);
        } else if (rows) {
          console.log('  Tables:');
          rows.forEach(r => console.log(`   - ${r.name}`));
        }
        resolve();
      });
    });
    
    // Check if app_session exists
    await new Promise((resolve) => {
      localDb.all("SELECT key, LENGTH(value) as len FROM app_session", [], (err, rows) => {
        if (err) {
          console.log('  app_session query failed or table does not exist.');
        } else if (rows) {
          console.log(`  app_session keys count: ${rows.length}`);
          rows.forEach(r => {
            console.log(`   - Key: [${r.key}], Length: ${r.len}`);
          });
        }
        resolve();
      });
    });
    
    localDb.close();
  } catch (e) {
    console.error('Error opening DB:', e.message);
  }
}

async function run() {
  await checkDb('./spaced_repetition.db');
  await checkDb('./db_volume/spaced_repetition.db');
  process.exit(0);
}

run();
