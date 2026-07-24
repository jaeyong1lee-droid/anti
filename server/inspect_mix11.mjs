import pg from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  const res = await pool.query('SELECT key FROM app_session WHERE key LIKE \'%mixed%\'');
  console.log('Mixed review keys:', res.rows.map(r => r.key));

  for (const row of res.rows) {
    if (row.key.endsWith('_q')) {
      const detail = await pool.query('SELECT value FROM app_session WHERE key = $1', [row.key]);
      const questions = JSON.parse(detail.rows[0].value);
      console.log(`\n=== Key: ${row.key} (${questions.length} questions) ===`);
      if (questions.length >= 11) {
        console.log('Question 11 (index 10):', questions[10].question.substring(0, 300));
      }
    }
  }
} catch (e) {
  console.error(e);
} finally {
  await pool.end();
}
