import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { healQuizQuestionObject } from './utils/latexUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

async function run() {
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query("SELECT key, value FROM app_session WHERE key LIKE 'review_questions_%'");
    console.log(`Scanning ${res.rows.length} sessions for healing...`);
    
    for (const row of res.rows) {
      let data;
      try {
        data = JSON.parse(row.value);
      } catch (e) {
        continue;
      }
      
      const isObjectSession = data && !Array.isArray(data) && Array.isArray(data.questions);
      const isArraySession = Array.isArray(data);
      const questions = isObjectSession ? data.questions : (isArraySession ? data : null);
      
      if (!questions) continue;
      
      let modified = false;
      const healedQuestions = questions.map(q => {
        const oldAnswer = q.answer;
        const healed = healQuizQuestionObject(q);
        if (healed.answer !== oldAnswer) {
          console.log(`  [HEALED] Key: ${row.key} | Q: "${q.question.substring(0, 30)}..." | Changed answer from "${oldAnswer}" to "${healed.answer}"`);
          modified = true;
        }
        return healed;
      });
      
      if (modified) {
        if (isObjectSession) {
          data.questions = healedQuestions;
        } else {
          data = healedQuestions;
        }
        const updatedValue = JSON.stringify(data);
        await pool.query("UPDATE app_session SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2", [updatedValue, row.key]);
        console.log(`  [UPDATED] Key ${row.key} saved to database.`);
      }
    }
  } catch (err) {
    console.error("Error during session healing:", err);
  } finally {
    await pool.end();
  }
}

run().catch(console.error);
