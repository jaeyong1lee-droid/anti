import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'spaced_repetition.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to the SQLite database:', dbPath);
  }
});

// Enable foreign key support in SQLite
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON;');
});

// Helper functions that wrap callback-based sqlite3 methods in Promises
export const dbQuery = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  },

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
};

// Initialize schema
export async function initDatabase() {
  try {
    // 1. topics table: stores studied topics and raw PDF data as a BLOB
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        keywords TEXT,
        pdf_name TEXT,
        pdf_data BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. schedules table: maps spaced repetition intervals for each topic
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id INTEGER NOT NULL,
        review_round INTEGER NOT NULL,
        planned_date TEXT NOT NULL,
        completed_at DATETIME,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
      )
    `);

    console.log('Database tables initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    throw error;
  }
}

export default db;
