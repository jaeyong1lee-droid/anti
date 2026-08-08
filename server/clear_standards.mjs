import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query("DELETE FROM app_session WHERE key IN ('engineering_standards', 'grading_standards', 'generation_standards', 'lockscreen_standards')");
    console.log(`Deleted ${res.rowCount} rows from app_session`);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
