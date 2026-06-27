import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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
    const detail = await pool.query("SELECT value FROM app_session WHERE key = 'review_questions_topic_16'");
    if (detail.rows.length > 0) {
      const val = detail.rows[0].value;
      fs.writeFileSync(path.resolve(__dirname, 'questions_topic_16.json'), val, 'utf8');
      console.log("Successfully wrote questions_topic_16.json!");
      const parsed = JSON.parse(val);
      console.log("Number of questions:", parsed.questions?.length);
      parsed.questions.forEach((q, idx) => {
        console.log(`Q${idx + 1}: ${q.type || ''} - ${q.question ? q.question.substring(0, 100) : ''}`);
      });
    } else {
      console.log("review_questions_topic_16 not found!");
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
