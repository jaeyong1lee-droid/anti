const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

db.serialize(() => {
  const tables = ['topics', 'reviews'];
  tables.forEach(table => {
    db.all(`PRAGMA table_info(${table})`, (err, cols) => {
      if (err || !cols) return;
      const textCols = cols.filter(c => c.type.includes('TEXT') || c.type.includes('VARCHAR')).map(c => c.name);
      if (!textCols.length) return;
      const conds = textCols.map(c => `${c} LIKE '%선형화 직선%'`).join(' OR ');
      db.all(`SELECT * FROM ${table} WHERE ${conds}`, (e, rows) => {
        if (rows && rows.length > 0) {
          rows.forEach(row => {
            textCols.forEach(col => {
              if (row[col] && row[col].includes('선형화 직선')) {
                const t = row[col];
                const idx = t.indexOf('선형화 직선');
                console.log(`[${table}.${col}]:\n${t.substring(Math.max(0, idx - 20), idx + 100)}\n\n`);
              }
            });
          });
        }
      });
    });
  });
});
