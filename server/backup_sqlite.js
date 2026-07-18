import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');
const backupDir = path.resolve(__dirname, 'backups');

if (!fs.existsSync(dbPath)) {
  console.error(`❌ SQLite database file not found at: ${dbPath}`);
  process.exit(1);
}

const tables = [
  'topics',
  'answersheet_reports',
  'schedules',
  'app_session',
  'question_feedback',
  'question_adjustments'
];

console.log(`🔌 Connecting to local SQLite database at: ${dbPath}`);
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, async (err) => {
  if (err) {
    console.error('❌ SQLite connection error:', err.message);
    process.exit(1);
  }

  const backupData = {
    timestamp: new Date().toISOString(),
    databaseName: 'SQLite_Local',
    tables: {}
  };

  try {
    for (const table of tables) {
      console.log(`Fetch data for local table: ${table}...`);
      const rows = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const processedRows = rows.map(row => {
        const newRow = { ...row };
        for (const key in newRow) {
          if (Buffer.isBuffer(newRow[key])) {
            newRow[key] = {
              _type: 'Buffer',
              data: newRow[key].toString('base64')
            };
          }
        }
        return newRow;
      });

      backupData.tables[table] = processedRows;
      console.log(`Successfully backed up ${processedRows.length} rows from ${table}`);
    }

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `sqlite_backup_${timestampStr}.json`;
    const filePath = path.join(backupDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`\n🎉 SQLite backup completed! Saved to: ${filePath}`);

    // Update latest backup reference for restore.js to use by default
    const latestPath = path.join(backupDir, 'latest_neon_backup.json');
    fs.writeFileSync(latestPath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`🔗 Updated latest backup reference file for sync: ${latestPath}`);

    process.exit(0);
  } catch (backupErr) {
    console.error('❌ Error during SQLite backup:', backupErr);
    process.exit(1);
  }
});
