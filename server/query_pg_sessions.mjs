import pg from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query("SELECT key, value FROM app_session WHERE key = 'review_questions_topic_16'");
    if (res.rows.length > 0) {
      console.log(res.rows[0].value);
    } else {
      console.log("No review_questions_topic_16 found");
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
