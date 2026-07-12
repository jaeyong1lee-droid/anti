import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

async function check() {
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query("SELECT key, value FROM app_session WHERE key = 'review_questions_schedule_173_sess_legacy_default'");
    if (res.rows.length > 0) {
      const data = JSON.parse(res.rows[0].value);
      console.log("=== SCHEDULE 173 CONTENT ===");
      console.log("selectedAnswers:", data.selectedAnswers);
      console.log("revealedQuestions:", data.revealedQuestions);
      console.log("tableAnswers:", data.tableAnswers);
      console.log("tableGradingResults:", data.tableGradingResults);
      console.log("tutorAnswers:", data.tutorAnswers);
      console.log("Questions length:", data.questions ? data.questions.length : 0);
    } else {
      console.log("Key not found");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check().catch(console.error);
