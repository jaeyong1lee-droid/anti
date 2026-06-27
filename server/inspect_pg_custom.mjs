import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
const connectionString = process.env.DATABASE_URL;

async function main() {
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    const res = await pool.query("SELECT key, value FROM app_session WHERE key = 'topic_extracted_text_2'");
    if (res.rows.length > 0) {
      console.log("=== topic_extracted_text_2 value ===");
      console.log(res.rows[0].value);
    } else {
      console.log("topic_extracted_text_2 not found.");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
