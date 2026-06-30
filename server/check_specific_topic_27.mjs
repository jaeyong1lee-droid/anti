import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env.production') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('Querying schedules and sessions for topic 27...');
  try {
    const resSchedules = await pool.query(
      "SELECT id, review_round, status, score, completed_at, planned_date FROM schedules WHERE topic_id = 27 ORDER BY review_round"
    );
    console.log('--- Schedules ---');
    console.table(resSchedules.rows);

    const scheduleIds = resSchedules.rows.map(r => r.id);
    if (scheduleIds.length > 0) {
      const keys = scheduleIds.map(id => `completed_review_schedule_${id}`);
      const resSessions = await pool.query(
        "SELECT key, LENGTH(value) as len FROM app_session WHERE key = ANY($1)",
        [keys]
      );
      console.log('--- Sessions ---');
      console.table(resSessions.rows);
    }
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

run();
