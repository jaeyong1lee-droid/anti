import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isPostgres = !!process.env.DATABASE_URL;
const isVercel = !!process.env.VERCEL;

let db = null;
let pgPool = null;

if (isPostgres) {
  console.log('PostgreSQL database URL detected. Connecting to Cloud PostgreSQL database...');
  pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for hosted services like Supabase / Neon
    }
  });
} else if (!isVercel) {
  // Only load and initialize sqlite3 if we are not running on serverless Vercel
  try {
    const sqlite3Module = await import('sqlite3');
    const sqlite3 = sqlite3Module.default;

    const volumePath = path.resolve(__dirname, 'db_volume');
    if (!fs.existsSync(volumePath)) {
      fs.mkdirSync(volumePath, { recursive: true });
    }
    const dbPath = path.resolve(volumePath, 'spaced_repetition.db');
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error connecting to SQLite database:', err.message);
      } else {
        console.log('Connected to the SQLite database:', dbPath);
      }
    });
    db.serialize(() => {
      db.run('PRAGMA foreign_keys = ON;');
    });
  } catch (sqliteErr) {
    console.error('Failed to load sqlite3 module dynamically on non-Vercel environment:', sqliteErr.message);
  }
} else {
  console.warn('Running on Serverless Vercel and DATABASE_URL is not set. SQLite is bypassed to prevent EROFS/binary crashes.');
}

// Translate SQLite placeholder '?' to PostgreSQL parameter '$1, $2, ...'
function translateSql(sql) {
  if (!isPostgres) return sql;
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

export const dbQuery = {
  async run(sql, params = []) {
    if (isPostgres) {
      if (!pgPool) throw new Error('PostgreSQL Pool is not initialized. Please configure DATABASE_URL.');
      let translatedSql = translateSql(sql);
      // SQLite uses AUTOINCREMENT and INSERT does not return ID by default. 
      // PostgreSQL needs RETURNING id to get the last inserted ID.
      const isInsert = translatedSql.trim().toUpperCase().startsWith('INSERT');
      if (isInsert) {
        translatedSql += ' RETURNING id';
      }
      try {
        const res = await pgPool.query(translatedSql, params);
        const lastID = isInsert && res.rows[0] ? res.rows[0].id : null;
        return { id: lastID, changes: res.rowCount };
      } catch (err) {
        console.error('PostgreSQL query error (run):', err);
        throw err;
      }
    } else {
      return new Promise((resolve, reject) => {
        if (!db) {
          return reject(new Error('SQLite database is not initialized. Vercel deployment requires a DATABASE_URL for Postgres.'));
        }
        db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, changes: this.changes });
        });
      });
    }
  },

  async get(sql, params = []) {
    if (isPostgres) {
      if (!pgPool) throw new Error('PostgreSQL Pool is not initialized. Please configure DATABASE_URL.');
      const translatedSql = translateSql(sql);
      try {
        const res = await pgPool.query(translatedSql, params);
        return res.rows[0] || null;
      } catch (err) {
        console.error('PostgreSQL query error (get):', err);
        throw err;
      }
    } else {
      return new Promise((resolve, reject) => {
        if (!db) {
          return reject(new Error('SQLite database is not initialized. Vercel deployment requires a DATABASE_URL for Postgres.'));
        }
        db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }
  },

  async all(sql, params = []) {
    if (isPostgres) {
      if (!pgPool) throw new Error('PostgreSQL Pool is not initialized. Please configure DATABASE_URL.');
      const translatedSql = translateSql(sql);
      try {
        const res = await pgPool.query(translatedSql, params);
        return res.rows;
      } catch (err) {
        console.error('PostgreSQL query error (all):', err);
        throw err;
      }
    } else {
      return new Promise((resolve, reject) => {
        if (!db) {
          return reject(new Error('SQLite database is not initialized. Vercel deployment requires a DATABASE_URL for Postgres.'));
        }
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }
};

// Initialize schema
export async function initDatabase() {
  try {
    if (isPostgres) {
      // 1. topics table: stores studied topics and raw PDF data as a BYTEA
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS topics (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          keywords TEXT,
          pdf_name TEXT,
          pdf_data BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. schedules table: maps spaced repetition intervals for each topic
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS schedules (
          id SERIAL PRIMARY KEY,
          topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
          review_round INTEGER NOT NULL,
          planned_date TEXT NOT NULL,
          completed_at TIMESTAMP,
          status TEXT DEFAULT 'pending'
        )
      `);
      console.log('Cloud PostgreSQL database tables initialized successfully.');
    } else {
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
      console.log('Local SQLite database tables initialized successfully.');
    }
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    throw error;
  }
}

// Auto init database tables if Postgres env is detected
if (isPostgres) {
  initDatabase().catch(err => {
    console.error('Auto initializing PostgreSQL tables failed:', err);
  });
}

export default db;
