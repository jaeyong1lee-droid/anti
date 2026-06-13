import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const tables = ['topics', 'answersheet_reports', 'schedules', 'app_session', 'question_feedback', 'question_adjustments'];
    for (const t of tables) {
      const res = await pool.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`Table ${t}: ${res.rows[0].count} rows`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

run();
