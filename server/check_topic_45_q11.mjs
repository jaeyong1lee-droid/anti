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
    const res = await pool.query("SELECT value FROM app_session WHERE key = 'review_questions_topic_45'");
    if (res.rows.length > 0) {
      const data = JSON.parse(res.rows[0].value);
      const questions = Array.isArray(data) ? data : (data.questions || []);
      // Find Q11 (index 10)
      const q = questions[10];
      if (q) {
        console.log("=== Q11 DETAILS ===");
        console.log("Question:", q.question);
        console.log("Options:", q.options);
        console.log("Answer:", q.answer);
        console.log("User Selected:", data.selectedAnswers ? data.selectedAnswers['10'] : 'none');
        console.log("Explanation:", q.explanation);
      } else {
        console.log("Q11 not found in array");
      }
    } else {
      console.log("Session not found");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check().catch(console.error);
