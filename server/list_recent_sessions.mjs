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
    console.log('=== LATEST APP_SESSIONS ===');
    const sessions = await pool.query('SELECT * FROM app_session ORDER BY updated_at DESC LIMIT 5');
    sessions.rows.forEach(r => {
      console.log(`Key: ${r.key}`);
      console.log(`Value: ${JSON.stringify(r.value).substring(0, 1000)}`);
      console.log('---');
    });

    console.log('=== LATEST ANSWERSHEET_REPORTS ===');
    const reports = await pool.query('SELECT * FROM answersheet_reports ORDER BY created_at DESC LIMIT 5');
    reports.rows.forEach(r => {
      console.log(`Report ID: ${r.id}`);
      console.log(`Score: ${r.score}`);
      console.log(`Feedback: ${JSON.stringify(r.feedback_text || r.feedback || r).substring(0, 1000)}`);
      console.log('---');
    });
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
