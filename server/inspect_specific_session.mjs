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
    const res = await pool.query("SELECT value FROM app_session WHERE key = 'exam_session'");
    if (res.rows.length > 0) {
      console.log("Found exam_session data!");
      const parsed = JSON.parse(res.rows[0].value);
      console.log(JSON.stringify(parsed, null, 2));
    } else {
      console.log("exam_session not found!");
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
