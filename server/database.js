import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL || 
                         process.env.POSTGRES_URL || 
                         process.env.POSTGRES_PRISMA_URL ||
                         process.env.SUPABASE_DATABASE_URL ||
                         '';

const isPostgres = !!connectionString;
const isVercel = !!process.env.VERCEL;

let db = null;
let pgPool = null;

// Safely parse a PostgreSQL connection URL into individual config params.
// This avoids pg library misinterpreting special characters (e.g. !!!!) in passwords.
function parseDbUrl(rawUrl) {
  try {
    // Replace leading 'postgres://' with 'postgresql://' for URL parsing
    const normalized = rawUrl.replace(/^postgres:\/\//, 'postgresql://');
    const url = new URL(normalized);
    return {
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 5432,
      database: url.pathname.replace(/^\//, ''),
    };
  } catch (e) {
    console.error('Failed to parse DATABASE_URL, falling back to raw connection string:', e.message);
    return null;
  }
}

if (isPostgres) {
  console.log('PostgreSQL database URL detected. Connecting to Cloud PostgreSQL database...');
  const parsed = parseDbUrl(connectionString);
  if (parsed) {
    console.log(`Parsed DB config → host: ${parsed.host}, port: ${parsed.port}, user: ${parsed.user}, db: ${parsed.database}`);
    pgPool = new pg.Pool({
      user: parsed.user,
      password: parsed.password,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      ssl: { rejectUnauthorized: false },
    });
  } else {
    // Fallback: use connection string directly
    pgPool = new pg.Pool({
      connectionString: connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
}

// Lazy loader for SQLite database to prevent top-level await syntax issues & Vercel EROFS crashes
async function getSQLiteDb() {
  if (db) return db;
  
  if (isVercel) {
    throw new Error('SQLite database is disabled in serverless Vercel environment. Please configure DATABASE_URL for Postgres.');
  }

  try {
    const sqlite3Module = await import('sqlite3');
    const sqlite3 = sqlite3Module.default;

    const volumePath = path.resolve(__dirname, 'db_volume');
    if (!fs.existsSync(volumePath)) {
      fs.mkdirSync(volumePath, { recursive: true });
    }
    const dbPath = path.resolve(volumePath, 'spaced_repetition.db');
    
    return new Promise((resolve, reject) => {
      const tempDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error connecting to SQLite database:', err.message);
          reject(err);
        } else {
          console.log('Connected to the SQLite database:', dbPath);
          tempDb.serialize(() => {
            tempDb.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
              if (pragmaErr) reject(pragmaErr);
              else {
                db = tempDb;
                resolve(db);
              }
            });
          });
        }
      });
    });
  } catch (sqliteErr) {
    console.error('Failed to load sqlite3 module dynamically on non-Vercel environment:', sqliteErr.message);
    throw sqliteErr;
  }
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
      const isInsert = translatedSql.trim().toUpperCase().startsWith('INSERT');
      if (isInsert && !translatedSql.includes('app_session')) {
        translatedSql += ' RETURNING id';
      }
      try {
        const res = await pgPool.query(translatedSql, params);
        const lastID = isInsert && res.rows[0] && res.rows[0].id ? res.rows[0].id : null;
        return { id: lastID, changes: res.rowCount };
      } catch (err) {
        console.error('PostgreSQL query error (run):', err);
        throw err;
      }
    } else {
      const localDb = await getSQLiteDb();
      return new Promise((resolve, reject) => {
        localDb.run(sql, params, function (err) {
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
      const localDb = await getSQLiteDb();
      return new Promise((resolve, reject) => {
        localDb.get(sql, params, (err, row) => {
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
      const localDb = await getSQLiteDb();
      return new Promise((resolve, reject) => {
        localDb.all(sql, params, (err, rows) => {
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
      // 3. app_session table: cross-device state sync (key-value store)
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS app_session (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Cloud PostgreSQL database tables initialized successfully.');
    } else {
      if (isVercel) {
        console.warn('Running on Serverless Vercel and DATABASE_URL is not set. Bypassing local SQLite database initialization.');
        return;
      }
      // Initialize Local SQLite
      const localDb = await getSQLiteDb();
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
      await dbQuery.run(`
        CREATE TABLE IF NOT EXISTS app_session (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

// Export default loaded db reference or null
export default db;
