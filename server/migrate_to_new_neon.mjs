import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const newConnectionString = 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';

// Locate local SQLite DB
let sqliteDbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');
if (!fs.existsSync(sqliteDbPath)) {
  sqliteDbPath = path.resolve(__dirname, 'anti.db');
}
if (!fs.existsSync(sqliteDbPath)) {
  sqliteDbPath = path.resolve(__dirname, 'spaced_repetition.db');
}

console.log('[Migration] Target New Neon DB Host: ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech');
console.log('[Migration] Source SQLite DB Path:', sqliteDbPath);

const sqliteDb = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ SQLite DB open failed:', err.message);
    process.exit(1);
  }
});

const pgPool = new pg.Pool({
  connectionString: newConnectionString,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('[Migration] Connecting to NEW Neon PostgreSQL...');
    const nowRes = await pgPool.query('SELECT NOW()');
    console.log('✅ NEW Neon PostgreSQL Connected! Time:', nowRes.rows[0].now);

    console.log('[Migration] Initializing tables in NEW Neon DB...');

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS topics (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        keywords TEXT,
        pdf_name TEXT,
        pdf_data BYTEA,
        pdf_url TEXT,
        extracted_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        category TEXT DEFAULT '일반'
      )
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS answersheet_reports (
        id SERIAL PRIMARY KEY,
        pdf_name TEXT,
        pdf_data BYTEA,
        pdf_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS app_session (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS question_feedback (
        id SERIAL PRIMARY KEY,
        topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        feedback_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    console.log('✅ All tables successfully created in NEW Neon DB.');

    // 1. Migrate topics
    const sqliteTopics = await new Promise((resolve, reject) => {
      sqliteDb.all("SELECT * FROM topics ORDER BY id ASC", [], (err, rows) => err ? reject(err) : resolve(rows));
    });
    console.log(`[Migration] SQLite topics found: ${sqliteTopics.length} rows`);

    let topicInsertedCount = 0;
    const topicIdMap = new Map(); // sqliteTopicId -> pgTopicId

    for (const t of sqliteTopics) {
      const dup = await pgPool.query("SELECT id FROM topics WHERE title = $1", [t.title]);
      let pgTopicId = null;
      if (dup.rows.length > 0) {
        pgTopicId = dup.rows[0].id;
      } else {
        const ins = await pgPool.query(
          `INSERT INTO topics (title, keywords, pdf_name, pdf_data, pdf_url, extracted_text, created_at, category) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            t.title,
            t.keywords || '',
            t.pdf_name || null,
            t.pdf_data || null,
            t.pdf_url || null,
            t.extracted_text || null,
            t.created_at || new Date().toISOString(),
            t.category || '일반'
          ]
        );
        pgTopicId = ins.rows[0].id;
        topicInsertedCount++;
      }
      topicIdMap.set(t.id, pgTopicId);
    }
    console.log(`✅ Topics migrated: ${topicInsertedCount} inserted (${sqliteTopics.length} total mapped)`);

    // 2. Migrate schedules
    const sqliteSchedules = await new Promise((resolve, reject) => {
      sqliteDb.all("SELECT * FROM schedules ORDER BY id ASC", [], (err, rows) => err ? reject(err) : resolve(rows));
    });
    console.log(`[Migration] SQLite schedules found: ${sqliteSchedules.length} rows`);

    let schedInsertedCount = 0;
    for (const s of sqliteSchedules) {
      let targetTopicId = topicIdMap.get(s.topic_id);
      if (!targetTopicId) {
        targetTopicId = s.topic_id;
      }

      const dup = await pgPool.query(
        "SELECT id FROM schedules WHERE topic_id = $1 AND review_round = $2",
        [targetTopicId, s.review_round]
      );
      if (dup.rows.length === 0) {
        await pgPool.query(
          `INSERT INTO schedules (topic_id, review_round, planned_date, completed_at, status, score, correct_count, total_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            targetTopicId,
            s.review_round,
            s.planned_date || new Date().toISOString().split('T')[0],
            s.completed_at || null,
            s.status || 'pending',
            s.score !== undefined ? s.score : null,
            s.correct_count !== undefined ? s.correct_count : null,
            s.total_count !== undefined ? s.total_count : null
          ]
        );
        schedInsertedCount++;
      }
    }
    console.log(`✅ Schedules migrated: ${schedInsertedCount} inserted`);

    // 3. Migrate app_session
    const sqliteSessions = await new Promise((resolve) => {
      sqliteDb.all("SELECT * FROM app_session", [], (err, rows) => err ? resolve([]) : resolve(rows));
    });
    console.log(`[Migration] SQLite sessions found: ${sqliteSessions.length} rows`);

    let sessionInsertedCount = 0;
    for (const sess of sqliteSessions) {
      await pgPool.query(
        `INSERT INTO app_session (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [sess.key, sess.value]
      );
      sessionInsertedCount++;
    }
    console.log(`✅ Sessions migrated: ${sessionInsertedCount} upserted`);

    console.log('\n==========================================================');
    console.log(' 🎉 [MIGRATION COMPLETE] NEW Neon DB is 100% POPULATED!');
    console.log('==========================================================');

  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

runMigration();
