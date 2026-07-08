import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths
const backupDir = path.resolve(__dirname, 'backups');
let backupFile = process.argv[2] || 'latest_neon_backup.json';
let backupPath = path.isAbsolute(backupFile) ? backupFile : path.join(backupDir, backupFile);

const volumePath = path.resolve(__dirname, 'db_volume');
const dbPath = path.resolve(volumePath, 'spaced_repetition.db');

if (!fs.existsSync(backupPath)) {
  console.error(`❌ Backup file not found at: ${backupPath}`);
  process.exit(1);
}

console.log(`📖 Reading backup file: ${backupPath}...`);
const backupContent = fs.readFileSync(backupPath, 'utf8');
const backupData = JSON.parse(backupContent);

// Ensure db_volume directory exists
if (!fs.existsSync(volumePath)) {
  fs.mkdirSync(volumePath, { recursive: true });
}

console.log(`🔌 Connecting to local SQLite database at: ${dbPath}`);
const db = new sqlite3.Database(dbPath, async (err) => {
  if (err) {
    console.error('❌ SQLite connection error:', err.message);
    process.exit(1);
  }

  try {
    // 1. Enable foreign keys
    await runQuery(db, 'PRAGMA foreign_keys = OFF;'); // Turn off temporarily for restore order safety

    // 2. Drop existing tables for clean schema recreation
    const tables = [
      'question_adjustments',
      'question_feedback',
      'schedules',
      'app_session',
      'answersheet_reports',
      'topics'
    ];

    console.log('🧹 Dropping existing local SQLite tables for clean restore...');
    for (const table of tables) {
      await runQuery(db, `DROP TABLE IF EXISTS ${table};`);
    }

    // 3. Initialize Tables with updated schemas
    console.log('🛠️ Recreating tables...');
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        keywords TEXT,
        pdf_name TEXT,
        pdf_data BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        category TEXT DEFAULT '일반'
      )
    `);

    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS answersheet_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pdf_name TEXT,
        pdf_data BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id INTEGER NOT NULL,
        review_round INTEGER NOT NULL,
        planned_date TEXT NOT NULL,
        completed_at DATETIME,
        status TEXT DEFAULT 'pending',
        score REAL,
        correct_count INTEGER,
        total_count INTEGER,
        FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
      )
    `);

    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS app_session (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS question_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        feedback_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
      )
    `);

    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS question_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        adjusted_text TEXT NOT NULL,
        user_feedback TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
      )
    `);

    // 4. Restore data in dependency order
    const orderOfRestore = [
      'topics',
      'answersheet_reports',
      'schedules',
      'app_session',
      'question_feedback',
      'question_adjustments'
    ];

    for (const table of orderOfRestore) {
      const rows = backupData.tables[table];
      if (!rows || rows.length === 0) {
        console.log(`ℹ️ No data in backup for table: ${table}. Skipping.`);
        continue;
      }

      console.log(`📥 Restoring table: ${table} (${rows.length} rows)...`);

      // SQLite supports parameterized insert. We prepare statements for efficiency.
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

      await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run('BEGIN TRANSACTION;');
          try {
            const stmt = db.prepare(sql);
            for (const row of rows) {
              const values = columns.map(col => {
                let val = row[col];
                if (val && typeof val === 'object' && val._type === 'Buffer') {
                  return Buffer.from(val.data, 'base64');
                }
                return val;
              });
              stmt.run(values, (err) => {
                if (err) {
                  console.error(`❌ Error inserting row into ${table}:`, err.message);
                }
              });
            }
            stmt.finalize();
            db.run('COMMIT;', (commitErr) => {
              if (commitErr) reject(commitErr);
              else resolve();
            });
          } catch (transErr) {
            db.run('ROLLBACK;');
            reject(transErr);
          }
        });
      });

      console.log(`✅ Successfully restored ${rows.length} rows to ${table}`);
    }

    // Re-enable foreign keys
    await runQuery(db, 'PRAGMA foreign_keys = ON;');
    console.log('🎉 SQLite database restore completed successfully!');
    process.exit(0);

  } catch (restoreErr) {
    console.error('❌ Error during SQLite restore:', restoreErr);
    process.exit(1);
  }
});

// Helper promise wrapper for sqlite run
function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
