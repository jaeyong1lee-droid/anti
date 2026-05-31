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
    const res = await pool.query("SELECT key, value FROM app_session WHERE key = 'formula_questions'");
    if (res.rows.length > 0) {
      console.log("Database Session Value for formula_questions:");
      const parsed = JSON.parse(res.rows[0].value);
      console.log(JSON.stringify(parsed, null, 2).substring(0, 1000) + "...\n");
      console.log("Is formulaQuestions an array? ", Array.isArray(parsed.formulaQuestions));
      console.log("Array length: ", parsed.formulaQuestions?.length);
    } else {
      console.log("No formula_questions session found in database!");
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
