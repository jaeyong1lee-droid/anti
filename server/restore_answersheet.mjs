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
    console.log("Connecting to Neon PostgreSQL...");
    const res = await pool.query("SELECT id, pdf_name FROM answersheet_reports ORDER BY id ASC");
    console.log(`Found ${res.rows.length} reports in answersheet_reports.`);
    
    if (res.rows.length === 0) {
      console.log("No reports found to restore.");
      return;
    }
    
    const answersheetQuestions = res.rows.map((row) => {
      return {
        title: row.pdf_name.replace(/\.[^/.]+$/, ""), // remove extension
        concept: '업로드한 본문 보고서가 연동되었습니다.',
        assumptions: '',
        formula: '',
        answer: '',
        answersheet_report_id: row.id,
        pdf_name: row.pdf_name
      };
    });
    
    const value = JSON.stringify({ answersheetQuestions });
    
    console.log("Deleting old empty answersheet session...");
    await pool.query("DELETE FROM app_session WHERE key = 'answersheet_questions'");
    
    console.log("Inserting restored answersheet questions session...");
    await pool.query(
      "INSERT INTO app_session (key, value, updated_at) VALUES ($1, $2, NOW())",
      ['answersheet_questions', value]
    );
    
    console.log("\nRestoration successful!");
    console.log(`Restored ${answersheetQuestions.length} topics:`);
    answersheetQuestions.forEach((q, i) => {
      console.log(`  [${i + 1}] Title: "${q.title}" (Report ID: ${q.answersheet_report_id})`);
    });
  } catch (err) {
    console.error("Restoration failed:", err);
  } finally {
    pool.end();
  }
}
run();
