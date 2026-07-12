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
      console.log(`Topic 45 Questions (${questions.length} items):`);
      questions.forEach((q, i) => {
        console.log(`  Q${i+1}: Type: ${q.type} | Question: ${q.question ? q.question.substring(0, 70) : ''}`);
      });
    } else {
      console.log('review_questions_topic_45 not found');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check().catch(console.error);
