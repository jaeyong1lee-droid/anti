const sqlite3 = require('sqlite3');
const path = require('path');

function checkDb(dbPath) {
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.log(`[${path.basename(dbPath)}] Error opening:`, err.message);
        return resolve();
      }
      db.all('SELECT id, title, category FROM topics ORDER BY id ASC', [], (err, rows) => {
        if (err) {
          console.log(`[${path.basename(dbPath)}] Error querying:`, err.message);
        } else {
          console.log(`\n=== [${dbPath}] ===`);
          console.log(`Total Topics: ${rows.length}`);
          if (rows.length > 0) {
            console.log(`First Topic: ID ${rows[0].id} - ${rows[0].title}`);
            console.log(`Last Topic: ID ${rows[rows.length - 1].id} - ${rows[rows.length - 1].title}`);
            console.log('\nAll Topics in this SQLite DB:');
            rows.forEach(r => console.log(`  [ID ${r.id}] ${r.title}`));
          }
        }
        db.close();
        resolve();
      });
    });
  });
}

async function run() {
  await checkDb(path.resolve('spaced_repetition.db'));
  await checkDb(path.resolve('db_volume/spaced_repetition.db'));
  await checkDb(path.resolve('backups/sqlite_backup_2026-07-04T15-04-53-686Z.db'));
}

run();
