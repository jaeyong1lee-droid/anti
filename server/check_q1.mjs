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
      const q1 = questions[0];
      const q11 = questions[10];
      
      console.log("=== Q1 (개요) ===");
      console.log("Type:", q1.type);
      console.log("Question:", q1.question);
      console.log("Concept:", q1.concept);
      console.log("Answer:", q1.answer);
      
      console.log("\n=== Q11 (객관식) ===");
      console.log("Type:", q11.type);
      console.log("Question:", q11.question);
      console.log("Answer:", q11.answer);
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
