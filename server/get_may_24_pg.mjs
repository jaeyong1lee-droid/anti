import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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
    const res = await pool.query("SELECT id, title, created_at FROM topics ORDER BY created_at DESC LIMIT 5");
    fs.writeFileSync('may24_questions.json', JSON.stringify(res.rows, null, 2), 'utf-8');
    console.log("Saved to may24_questions.json");
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
