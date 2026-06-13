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
    
    // 1. Show all keys in app_session with their lengths and last updated timestamp
    console.log("--- Current Session Keys in Database ---");
    const keysRes = await pool.query("SELECT key, length(value) as len, updated_at FROM app_session");
    console.table(keysRes.rows);

    // 2. Inspect 'answersheet_questions' content
    const res = await pool.query("SELECT key, value FROM app_session WHERE key = 'answersheet_questions'");
    if (res.rows.length > 0) {
      console.log("\n--- Database Session Value for answersheet_questions ---");
      const parsed = JSON.parse(res.rows[0].value);
      const questions = parsed.answersheetQuestions || [];
      console.log("Is answersheetQuestions an array? ", Array.isArray(questions));
      console.log("Array length: ", questions.length);
      
      // Print detailed summary of each topic in answersheet
      questions.forEach((q, index) => {
        console.log(`[${index + 1}] Title: "${q.title}", Formula/Desc: "${q.formula ? q.formula.substring(0, 55) : ''}", Report ID: ${q.answersheet_report_id}`);
      });
    } else {
      console.log("\n[WARNING] No 'answersheet_questions' session found in database!");
    }
    
    // 3. Let's check table counts
    console.log("\n--- Checking database row counts ---");
    const topicsCount = await pool.query("SELECT COUNT(*) FROM topics");
    const schedulesCount = await pool.query("SELECT COUNT(*) FROM schedules");
    const sessionCount = await pool.query("SELECT COUNT(*) FROM app_session");
    console.log("Topics count in PostgreSQL:", topicsCount.rows[0].count);
    console.log("Schedules count in PostgreSQL:", schedulesCount.rows[0].count);
    console.log("App Session count in PostgreSQL:", sessionCount.rows[0].count);

    const reportsCountRes = await pool.query("SELECT COUNT(*) FROM answersheet_reports");
    console.log("answersheet_reports count:", reportsCountRes.rows[0].count);

    const reportsRes = await pool.query("SELECT id, pdf_name, created_at FROM answersheet_reports ORDER BY id DESC LIMIT 10");
    console.table(reportsRes.rows);

  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
