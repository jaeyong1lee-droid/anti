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
    const res = await pool.query("SELECT key, updated_at FROM app_session");
    console.log(`Found ${res.rows.length} rows in app_session.`);
    res.rows.forEach(row => {
      console.log(`- ${row.key} (updated: ${row.updated_at})`);
    });
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await pool.end();
  }
}

main();
