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
    console.log("Connecting to PostgreSQL...");
    
    // List all topics
    const topicsRes = await pool.query("SELECT id, title, pdf_name, created_at FROM topics ORDER BY id ASC");
    console.log(`\n--- Topics in PostgreSQL (${topicsRes.rows.length} rows) ---`);
    console.table(topicsRes.rows);

    // List all schedules
    const schedulesRes = await pool.query("SELECT id, topic_id, review_round, planned_date, status, score FROM schedules ORDER BY id ASC");
    console.log(`\n--- Schedules in PostgreSQL (${schedulesRes.rows.length} rows) ---`);
    console.table(schedulesRes.rows);

    // List all app_session rows
    const sessionRes = await pool.query("SELECT key, updated_at FROM app_session");
    console.log(`\n--- App Session keys in PostgreSQL (${sessionRes.rows.length} rows) ---`);
    console.table(sessionRes.rows);

  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
