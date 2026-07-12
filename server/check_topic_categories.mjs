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
    const res = await pool.query("SELECT id, title, category FROM topics WHERE id IN (25, 27, 28, 44, 45, 49, 69) ORDER BY id");
    console.log("=== TOPIC CATEGORIES ===");
    for (const row of res.rows) {
      console.log(`ID: ${row.id} | Title: ${row.title} | Category: ${row.category}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check().catch(console.error);
