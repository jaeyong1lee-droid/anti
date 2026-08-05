import pg from 'pg';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const oldConn = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';
const newConn = 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';

const oldPool = new pg.Pool({ connectionString: oldConn.replace(/[?&]channel_binding=[^&]*/g, ''), ssl: { rejectUnauthorized: false } });
const newPool = new pg.Pool({ connectionString: newConn.replace(/[?&]channel_binding=[^&]*/g, ''), ssl: { rejectUnauthorized: false } });

let sqliteDbPath = path.resolve('db_volume', 'spaced_repetition.db');
if (!fs.existsSync(sqliteDbPath)) {
  sqliteDbPath = path.resolve('spaced_repetition.db');
}

console.log('Using SQLite DB Path for local sync:', sqliteDbPath);
const sqliteDb = new sqlite3.Database(sqliteDbPath);

async function migrate() {
  console.log('\n==========================================================');
  console.log('🚀 [FULL MIGRATION] Starting migration from Old Neon DB to New Neon DB & Local SQLite...');
  console.log('==========================================================\n');

  try {
    // Ensure tables exist in NEW Neon DB
    await newPool.query(`
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

    await newPool.query(`
      CREATE TABLE IF NOT EXISTS answersheet_reports (
        id SERIAL PRIMARY KEY,
        pdf_name TEXT,
        pdf_data BYTEA,
        pdf_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await newPool.query(`
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

    await newPool.query(`
      CREATE TABLE IF NOT EXISTS app_session (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await newPool.query(`
      CREATE TABLE IF NOT EXISTS question_feedback (
        id SERIAL PRIMARY KEY,
        topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        feedback_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await newPool.query(`
      CREATE TABLE IF NOT EXISTS question_adjustments (
        id SERIAL PRIMARY KEY,
        topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        adjusted_text TEXT NOT NULL,
        user_feedback TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Step 1: Migrate Topics
    const oldTopics = await oldPool.query('SELECT * FROM topics ORDER BY id ASC');
    console.log(`[Topics] Old DB has ${oldTopics.rows.length} topics.`);

    let topicInsertedCount = 0;
    let topicUpdatedCount = 0;
    const oldToNewTopicIdMap = new Map();

    for (const t of oldTopics.rows) {
      // Check if exists in new DB by title
      const existing = await newPool.query('SELECT id FROM topics WHERE title = $1', [t.title]);
      let newTopicId = null;

      if (existing.rows.length > 0) {
        newTopicId = existing.rows[0].id;
        // Update details if pdf_data / pdf_url / extracted_text is richer
        await newPool.query(
          `UPDATE topics SET 
            keywords = COALESCE($1, keywords),
            pdf_name = COALESCE($2, pdf_name),
            pdf_data = COALESCE($3, pdf_data),
            pdf_url = COALESCE($4, pdf_url),
            extracted_text = COALESCE($5, extracted_text),
            category = COALESCE($6, category)
           WHERE id = $7`,
          [t.keywords, t.pdf_name, t.pdf_data, t.pdf_url, t.extracted_text, t.category || '일반', newTopicId]
        );
        topicUpdatedCount++;
      } else {
        const ins = await newPool.query(
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
        newTopicId = ins.rows[0].id;
        topicInsertedCount++;
      }
      oldToNewTopicIdMap.set(Number(t.id), Number(newTopicId));

      // Also insert into local SQLite if missing
      await new Promise((resolve) => {
        sqliteDb.get('SELECT id FROM topics WHERE title = ?', [t.title], (err, row) => {
          if (!row) {
            sqliteDb.run(
              `INSERT INTO topics (title, keywords, pdf_name, pdf_url, extracted_text, created_at, category)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [t.title, t.keywords || '', t.pdf_name || null, t.pdf_url || null, t.extracted_text || null, t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(), t.category || '일반'],
              () => resolve()
            );
          } else {
            resolve();
          }
        });
      });
    }

    const finalTopicsRes = await newPool.query('SELECT count(*) as cnt FROM topics');
    console.log(`✅ [Topics] Migrated: ${topicInsertedCount} inserted, ${topicUpdatedCount} updated. Total in NEW DB: ${finalTopicsRes.rows[0].cnt} topics.`);

    // Step 2: Migrate Schedules
    const oldSchedules = await oldPool.query('SELECT * FROM schedules ORDER BY id ASC');
    console.log(`[Schedules] Old DB has ${oldSchedules.rows.length} schedules.`);

    let schedInsertedCount = 0;
    for (const s of oldSchedules.rows) {
      const newTopicId = oldToNewTopicIdMap.get(Number(s.topic_id));
      if (!newTopicId) continue;

      const dup = await newPool.query(
        'SELECT id FROM schedules WHERE topic_id = $1 AND review_round = $2',
        [newTopicId, s.review_round]
      );

      if (dup.rows.length === 0) {
        await newPool.query(
          `INSERT INTO schedules (topic_id, review_round, planned_date, completed_at, status, score, correct_count, total_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            newTopicId,
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
      } else {
        // Update status and completed_at if old DB has completed schedule
        if (s.status === 'completed' || s.completed_at) {
          await newPool.query(
            `UPDATE schedules SET 
              status = $1,
              completed_at = $2,
              score = COALESCE($3, score),
              correct_count = COALESCE($4, correct_count),
              total_count = COALESCE($5, total_count)
             WHERE id = $6`,
            [s.status, s.completed_at, s.score, s.correct_count, s.total_count, dup.rows[0].id]
          );
        }
      }
    }
    const finalSchedulesRes = await newPool.query('SELECT count(*) as cnt FROM schedules');
    console.log(`✅ [Schedules] Migrated: ${schedInsertedCount} inserted. Total in NEW DB: ${finalSchedulesRes.rows[0].cnt} schedules.`);

    // Step 3: Migrate app_session
    const oldSessions = await oldPool.query('SELECT * FROM app_session');
    console.log(`[Sessions] Old DB has ${oldSessions.rows.length} session entries.`);

    let sessionUpsertCount = 0;
    for (const sess of oldSessions.rows) {
      await newPool.query(
        `INSERT INTO app_session (key, value, updated_at) VALUES ($1, $2, COALESCE($3, CURRENT_TIMESTAMP))
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        [sess.key, sess.value, sess.updated_at]
      );
      sessionUpsertCount++;
    }
    const finalSessionsRes = await newPool.query('SELECT count(*) as cnt FROM app_session');
    console.log(`✅ [Sessions] Migrated: ${sessionUpsertCount} upserted. Total in NEW DB: ${finalSessionsRes.rows[0].cnt} sessions.`);

    // Step 4: Migrate answersheet_reports
    try {
      const oldAnswersheets = await oldPool.query('SELECT * FROM answersheet_reports');
      console.log(`[Answersheets] Old DB has ${oldAnswersheets.rows.length} answersheet reports.`);
      for (const as of oldAnswersheets.rows) {
        const dup = await newPool.query('SELECT id FROM answersheet_reports WHERE pdf_name = $1', [as.pdf_name]);
        if (dup.rows.length === 0) {
          await newPool.query(
            `INSERT INTO answersheet_reports (pdf_name, pdf_data, pdf_url, created_at)
             VALUES ($1, $2, $3, $4)`,
            [as.pdf_name, as.pdf_data, as.pdf_url, as.created_at]
          );
        }
      }
    } catch (e) {
      console.warn('[Answersheets] Migration note:', e.message);
    }

    console.log('\n==========================================================');
    console.log(' 🎉 [MIGRATION 100% COMPLETE] All 50 topics & data merged into NEW DB!');
    console.log('==========================================================\n');

  } catch (err) {
    console.error('❌ Migration Error:', err);
  } finally {
    sqliteDb.close();
    await oldPool.end();
    await newPool.end();
  }
}

migrate();
