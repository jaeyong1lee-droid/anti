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
    const res = await pool.query("SELECT id, pdf_name, created_at FROM answersheet_reports ORDER BY id DESC LIMIT 5");
    console.log("Answersheet Reports:");
    console.table(res.rows);
    
    if (res.rows.length > 0) {
      const latestId = res.rows[0].id;
      const detailRes = await pool.query("SELECT id, pdf_name, pdf_data FROM answersheet_reports WHERE id = $1", [latestId]);
      if (detailRes.rows.length > 0) {
        const row = detailRes.rows[0];
        console.log(`Latest Report details (ID: ${row.id}, Name: ${row.pdf_name}):`);
        // Let's print the first 2000 chars of pdf_data to see what it is
        console.log(String(row.pdf_data).substring(0, 2000));
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
