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
    const res = await pool.query("SELECT key, value, updated_at FROM app_session ORDER BY updated_at DESC LIMIT 15");
    console.log("=== LATEST SESSIONS IN DB ===");
    for (const row of res.rows) {
      console.log(`\nKey: ${row.key} | Updated At: ${row.updated_at}`);
      const valStr = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
      try {
        const data = JSON.parse(valStr);
        if (data && Array.isArray(data)) {
          console.log(`  Array of ${data.length} items`);
          data.slice(0, 3).forEach((q, i) => {
            console.log(`    Item ${i+1}: Type = ${q.type} | Question = ${q.question ? q.question.substring(0, 50) : ''}`);
          });
        } else if (data && data.questions && Array.isArray(data.questions)) {
          console.log(`  Session Object. Questions: ${data.questions.length} items`);
          data.questions.slice(0, 3).forEach((q, i) => {
            console.log(`    Q${i+1}: Type = ${q.type} | Question = ${q.question ? q.question.substring(0, 50) : ''}`);
          });
        } else {
          console.log(`  Raw Length: ${valStr.length} | Preview: ${valStr.substring(0, 100)}`);
        }
      } catch (e) {
        console.log(`  Raw Length: ${valStr.length} | Preview: ${valStr.substring(0, 100)}`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check().catch(console.error);
