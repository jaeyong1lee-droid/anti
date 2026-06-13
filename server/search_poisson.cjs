const pg = require('pg');
const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://neondb_owner:npg_9VB7MqNvTjtA@ep-misty-dawn-apk5itib-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function searchPostgres() {
  console.log('=== SEARCHING POSTGRESQL ===');
  const pool = new pg.Pool({ connectionString });
  try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const tables = res.rows.map(r => r.table_name);
    console.log('Tables:', tables);

    for (const table of tables) {
      const colRes = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND data_type IN ('text', 'character varying', 'json', 'jsonb')
      `, [table]);
      const cols = colRes.rows.map(c => c.column_name);

      for (const col of cols) {
        try {
          const matchRes = await pool.query(`SELECT COUNT(*) FROM ${table} WHERE "${col}"::text LIKE '%포아송%'`);
          const count = parseInt(matchRes.rows[0].count, 10);
          if (count > 0) {
            console.log(`Match in PG table: ${table}, col: ${col} (Count: ${count})`);
            const rowsRes = await pool.query(`SELECT * FROM ${table} WHERE "${col}"::text LIKE '%포아송%' LIMIT 10`);
            rowsRes.rows.forEach((row, i) => {
              console.log(`[${i+1}] Details:`, JSON.stringify(row).substring(0, 800));
            });
          }
        } catch(e) {
          // ignore
        }
      }
    }
  } catch(e) {
    console.error('PG error:', e.message);
  } finally {
    await pool.end();
  }
}

async function searchSqlite(dbFile) {
  console.log(`=== SEARCHING SQLITE: ${dbFile} ===`);
  if (!fs.existsSync(dbFile)) {
    console.log('File does not exist');
    return;
  }
  const db = new sqlite3.Database(dbFile);
  return new Promise((resolve) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error(err);
        resolve();
        return;
      }
      const names = tables.map(t => t.name);
      let pending = names.length;
      if (pending === 0) {
        db.close();
        resolve();
        return;
      }

      names.forEach(table => {
        db.all(`PRAGMA table_info(${table})`, [], (infoErr, cols) => {
          if (infoErr) {
            if (--pending === 0) { db.close(); resolve(); }
            return;
          }
          const textCols = cols.filter(c => ['TEXT', 'BLOB', ''].includes(c.type.toUpperCase())).map(c => c.name);
          let colPending = textCols.length;
          if (colPending === 0) {
            if (--pending === 0) { db.close(); resolve(); }
            return;
          }

          textCols.forEach(col => {
            db.all(`SELECT * FROM ${table} WHERE CAST(${col} AS TEXT) LIKE '%포아송%'`, [], (matchErr, rows) => {
              if (!matchErr && rows && rows.length > 0) {
                console.log(`Match in SQLite (${path.basename(dbFile)}) -> Table: ${table}, Col: ${col} (Count: ${rows.length})`);
                rows.forEach((r, i) => {
                  console.log(`[${i+1}] Details:`, JSON.stringify(r).substring(0, 800));
                });
              }
              if (--colPending === 0) {
                if (--pending === 0) { db.close(); resolve(); }
              }
            });
          });
        });
      });
    });
  });
}

async function main() {
  await searchPostgres();
  await searchSqlite(path.resolve(__dirname, 'spaced_repetition.db'));
}
main();
