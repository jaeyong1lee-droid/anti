import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const res = await pool.query("SELECT * FROM app_session");
    console.log(`Found ${res.rows.length} rows in app_session.`);
    for (const row of res.rows) {
      if (row.value && (row.value.includes('Gouy') || row.value.includes('CaO') || row.value.includes('INPUT_1'))) {
        console.log(`\n-> MATCH FOUND IN KEY: ${row.key}`);
        try {
          const parsed = JSON.parse(row.value);
          const list = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.formulaQuestions || parsed.currentQuestions || []);
          console.log(`Number of items: ${list.length}`);
          
          list.forEach((q, idx) => {
            if (q.question && (q.question.includes('Gouy') || q.question.includes('CaO') || q.question.includes('INPUT_1'))) {
              console.log(`\n--- Item ${idx} ---`);
              console.log(`Type: ${q.type}`);
              console.log(`Question: ${q.question}`);
              console.log(`tableData:`, JSON.stringify(q.tableData));
              console.log(`answers:`, JSON.stringify(q.answers));
              if (q.options) console.log(`options:`, JSON.stringify(q.options));
            }
          });
        } catch (e) {
          console.log(`(Failed to parse JSON: ${e.message})`);
          const idx = row.value.indexOf('Gouy');
          if (idx !== -1) {
            console.log("Substring:", row.value.substring(Math.max(0, idx - 100), Math.min(row.value.length, idx + 400)));
          }
        }
      }
    }
  } catch (e) {
    console.error("Query error:", e);
  } finally {
    await pool.end();
  }
}

main();
