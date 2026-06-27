import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL || 
                         process.env.POSTGRES_URL || 
                         process.env.POSTGRES_PRISMA_URL ||
                         process.env.SUPABASE_DATABASE_URL ||
                         '';

export const isPostgres = !!connectionString;
const isVercel = !!process.env.VERCEL;

let db = null;
let pgPool = null;

// Clean up connectionString to remove problematic parameters for node-postgres
let sanitizedConnectionString = connectionString;
if (connectionString) {
  sanitizedConnectionString = connectionString
    .replace(/[?&]channel_binding=[^&]*/g, '')
    .trim();
}

// Safely parse a PostgreSQL connection URL into individual config params (only for logging).
function parseDbUrl(rawUrl) {
  try {
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
    return null;
  }
}

if (isPostgres) {
  console.log('PostgreSQL database URL detected. Connecting to Cloud PostgreSQL database...');
  const parsed = parseDbUrl(sanitizedConnectionString);
  if (parsed) {
    console.log(`Parsed DB config → host: ${parsed.host}, port: ${parsed.port}, user: ${parsed.user}, db: ${parsed.database}`);
  }
  
  pgPool = new pg.Pool({
    connectionString: sanitizedConnectionString,
    ssl: { rejectUnauthorized: false },
    max: 20, // Neon serverless connection limit protection
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 30000, // Extend timeout to 30 seconds for Neon wake-up spin
  });

  // Gracefully handle idle client errors to prevent server crash or connection lockup on Neon pauses
  pgPool.on('error', (err, client) => {
    console.error('Unexpected error on idle PostgreSQL client in Neon Pool:', err.message);
  });
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

async function executeWithRetry(fn, maxRetries = 3, delayMs = 2000) {
  const isVercel = !!process.env.VERCEL;
  // If running on Vercel, shorten retries and delays to avoid exceeding serverless timeout limits (max 10s)
  const actualRetries = isVercel ? 2 : maxRetries;
  const actualDelay = isVercel ? 200 : delayMs;

  let attempt = 0;
  while (attempt < actualRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      console.warn(`[DB Retry] Database query failed (attempt ${attempt}/${actualRetries}):`, err.message);
      if (attempt >= actualRetries) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, actualDelay));
    }
  }
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
      return executeWithRetry(async () => {
        const res = await pgPool.query(translatedSql, params);
        const lastID = isInsert && res.rows[0] && res.rows[0].id ? res.rows[0].id : null;
        return { id: lastID, changes: res.rowCount };
      });
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
      return executeWithRetry(async () => {
        const res = await pgPool.query(translatedSql, params);
        return res.rows[0] || null;
      });
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
      return executeWithRetry(async () => {
        const res = await pgPool.query(translatedSql, params);
        return res.rows;
      });
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
      try {
        console.log('Verifying Cloud PostgreSQL connection...');
        // Execute a quick probe query with retry to ensure database is responsive
        await executeWithRetry(async () => {
          await pgPool.query('SELECT NOW()');
        }, 5, 3000); // 5 retries, 3 seconds delay each to allow Neon compute to wake up

        
        // 1. topics table: stores studied topics and raw PDF data as a BYTEA
        await pgPool.query(`
          CREATE TABLE IF NOT EXISTS topics (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            keywords TEXT,
            pdf_name TEXT,
            pdf_data BYTEA,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            category TEXT DEFAULT '일반'
          )
        `);

        // answersheet_reports table: stores original documents for answersheets
        await pgPool.query(`
          CREATE TABLE IF NOT EXISTS answersheet_reports (
            id SERIAL PRIMARY KEY,
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
            status TEXT DEFAULT 'pending',
            score REAL,
            correct_count INTEGER,
            total_count INTEGER
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
        // 4. question_feedback table: stores recommendations and non-recommendations
        await pgPool.query(`
          CREATE TABLE IF NOT EXISTS question_feedback (
            id SERIAL PRIMARY KEY,
            topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
            question_text TEXT NOT NULL,
            feedback_type TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        // 5. question_adjustments table: stores user adjustments/feedbacks for questions
        await pgPool.query(`
          CREATE TABLE IF NOT EXISTS question_adjustments (
            id SERIAL PRIMARY KEY,
            topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
            question_text TEXT NOT NULL,
            adjusted_text TEXT NOT NULL,
            user_feedback TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('Cloud PostgreSQL database tables initialized successfully.');
        await migrateSchedulesTable();
      } catch (pgInitError) {
        if (isVercel) {
          throw pgInitError; // Keep failing on Vercel as SQLite is disabled there
        }
        console.error('PostgreSQL connection failed at startup. Keeping PostgreSQL active to retry and connect to the Neon cloud database: ', pgInitError.message);
      }
    } else {
      await initSQLiteTables();
    }
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    throw error;
  }
}

async function initSQLiteTables() {
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      category TEXT DEFAULT '일반'
    )
  `);

  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS answersheet_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      score REAL,
      correct_count INTEGER,
      total_count INTEGER,
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
  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS question_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      feedback_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
    )
  `);
  await dbQuery.run(`
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
  console.log('Local SQLite database tables initialized successfully.');
  await migrateSchedulesTable();
}

async function migrateSchedulesTable() {
  try {
    if (isPostgres) {
      if (pgPool) {
        await pgPool.query(`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS score REAL`);
        await pgPool.query(`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS correct_count INTEGER`);
        await pgPool.query(`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS total_count INTEGER`);
        await pgPool.query(`ALTER TABLE topics ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '일반'`);
        console.log('Cloud PostgreSQL schedules and topics tables migration checked.');
      }
    } else {
      try {
        await dbQuery.run(`ALTER TABLE schedules ADD COLUMN score REAL`);
      } catch (e) {}
      try {
        await dbQuery.run(`ALTER TABLE schedules ADD COLUMN correct_count INTEGER`);
      } catch (e) {}
      try {
        await dbQuery.run(`ALTER TABLE schedules ADD COLUMN total_count INTEGER`);
      } catch (e) {}
      try {
        await dbQuery.run(`ALTER TABLE topics ADD COLUMN category TEXT DEFAULT '일반'`);
      } catch (e) {}
      try {
        await dbQuery.run(`ALTER TABLE app_session ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
      } catch (e) {}
      console.log('Local SQLite schedules and topics tables migration checked.');
    }
  } catch (err) {
    console.error('Migration schedules table error:', err);
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
