import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query('SELECT id, title, category, pdf_name FROM topics');
    console.log('Topics in database:', res.rows);
    for (const row of res.rows) {
      const detail = await pool.query('SELECT pdf_data FROM topics WHERE id = $1', [row.id]);
      const data = detail.rows[0].pdf_data;
      if (data) {
        const dataStr = data.toString('utf-8');
        console.log(`ID ${row.id} ("${row.title}") Length: ${dataStr.length}`);
        console.log(`  includes 석회암:`, dataStr.includes('석회암'));
        console.log(`  includes Mohr:`, dataStr.includes('Mohr'));
        console.log(`  includes 코어시료:`, dataStr.includes('코어시료'));
        console.log(`  includes ANTIGRAVITY_SCREENSHOT_END:`, dataStr.includes('ANTIGRAVITY_SCREENSHOT_END'));
      }
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
