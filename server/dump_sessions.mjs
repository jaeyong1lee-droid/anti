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
    const keysRes = await pool.query("SELECT key, length(value) as len, updated_at FROM app_session");
    console.log("Session keys:");
    console.table(keysRes.rows);

    for (const row of keysRes.rows) {
      if (row.len > 100) {
        const res = await pool.query("SELECT value FROM app_session WHERE key = $1", [row.key]);
        const val = JSON.parse(res.rows[0].value);
        console.log(`\n================ KEY: ${row.key} ================`);
        if (row.key.includes('questions')) {
          const qs = val.questions || val.examQuestions || val.answersheetQuestions || [];
          console.log(`Found ${qs.length} questions.`);
          qs.forEach((q, idx) => {
            console.log(`Q[${idx}]: type=${q.type}, subtype=${q.subtype}, question=${q.question ? q.question.substring(0, 60) : ''}`);
            if (q.tableData) {
              console.log("  tableData:", JSON.stringify(q.tableData));
            }
            if (q.answers) {
              console.log("  answers:", JSON.stringify(q.answers));
            }
          });
        } else {
          console.log(JSON.stringify(val).substring(0, 1000));
        }
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
