import pg from 'pg';

const oldConn = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';
const newConn = 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function finish() {
  console.log('🔄 Finishing schedules and session migration with robust retry handling...');

  const oldPool = new pg.Pool({
    connectionString: oldConn.replace(/[?&]channel_binding=[^&]*/g, ''),
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10000,
  });

  const newPool = new pg.Pool({
    connectionString: newConn.replace(/[?&]channel_binding=[^&]*/g, ''),
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10000,
  });

  try {
    // Build map of old topic title -> new topic id and old topic id -> new topic id
    const oldTopics = await oldPool.query('SELECT id, title FROM topics');
    const newTopics = await newPool.query('SELECT id, title FROM topics');
    
    const titleToNewIdMap = new Map();
    newTopics.rows.forEach(r => titleToNewIdMap.set(r.title.trim().toLowerCase(), r.id));

    const oldIdToNewIdMap = new Map();
    oldTopics.rows.forEach(r => {
      const newId = titleToNewIdMap.get(r.title.trim().toLowerCase());
      if (newId) {
        oldIdToNewIdMap.set(Number(r.id), Number(newId));
      }
    });

    console.log(`Mapped ${oldIdToNewIdMap.size} old topic IDs to new topic IDs.`);

    // 1. Schedules
    const oldSchedules = await oldPool.query('SELECT * FROM schedules ORDER BY id ASC');
    console.log(`Migrating ${oldSchedules.rows.length} schedules...`);

    let schedInserted = 0;
    let schedUpdated = 0;

    for (const s of oldSchedules.rows) {
      const newTopicId = oldIdToNewIdMap.get(Number(s.topic_id));
      if (!newTopicId) continue;

      const dup = await newPool.query(
        'SELECT id, status FROM schedules WHERE topic_id = $1 AND review_round = $2',
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
        schedInserted++;
      } else {
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
          schedUpdated++;
        }
      }
    }
    console.log(`✅ Schedules: ${schedInserted} inserted, ${schedUpdated} updated.`);

    // 2. App Session
    const oldSessions = await oldPool.query('SELECT * FROM app_session');
    console.log(`Migrating ${oldSessions.rows.length} session keys...`);

    let sessionUpserted = 0;
    for (const sess of oldSessions.rows) {
      await newPool.query(
        `INSERT INTO app_session (key, value, updated_at) VALUES ($1, $2, COALESCE($3, CURRENT_TIMESTAMP))
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        [sess.key, sess.value, sess.updated_at]
      );
      sessionUpserted++;
    }
    console.log(`✅ App Session: ${sessionUpserted} upserted.`);

    // Check final counts
    const tCnt = await newPool.query('SELECT count(*) as cnt FROM topics');
    const sCnt = await newPool.query('SELECT count(*) as cnt FROM schedules');
    const sessCnt = await newPool.query('SELECT count(*) as cnt FROM app_session');

    console.log('\n==========================================================');
    console.log(' 🎉 [FINAL STATUS IN NEW NEON DB]');
    console.log(`  - Total Topics: ${tCnt.rows[0].cnt}`);
    console.log(`  - Total Schedules: ${sCnt.rows[0].cnt}`);
    console.log(`  - Total App Sessions: ${sessCnt.rows[0].cnt}`);
    console.log('==========================================================\n');

  } catch (err) {
    console.error('❌ Error finishing migration:', err);
  } finally {
    await oldPool.end();
    await newPool.end();
  }
}

finish();
