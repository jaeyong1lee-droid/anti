import pg from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  const res = await pool.query('SELECT value FROM app_session WHERE key = \'review_questions_topic_23_q\'');
  if (res.rows.length > 0) {
    const questions = JSON.parse(res.rows[0].value);
    console.log(`Total questions in topic 23 session: ${questions.length}`);
    const q7 = questions[6]; // Question 7 (0-indexed 6)
    console.log('=== Question 7 ===');
    console.dir(q7, { depth: null });
  }
} catch (e) {
  console.error(e);
} finally {
  await pool.end();
}
