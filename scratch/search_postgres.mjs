import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

const connectionString = process.env.DATABASE_URL;
console.log('Connecting to:', connectionString);

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    // 1. Search in topics
    console.log('Searching in topics table...');
    const topicsRes = await pool.query("SELECT id, title, keywords FROM topics WHERE title LIKE '%이방성%' OR keywords LIKE '%이방성%'");
    console.log('Topics matches:', topicsRes.rows);

    // 2. Search in app_session keys or values
    console.log('Searching in app_session table for key values containing "이방성" or "eq"...');
    const sessionRes = await pool.query("SELECT key, substring(value from 1 for 100) as val_short FROM app_session WHERE value LIKE '%이방성%' LIMIT 10");
    console.log('App session matches for "이방성":');
    sessionRes.rows.forEach(r => console.log(`Key: ${r.key}`));

    // Let's get the full content of any sessions that match
    for (const row of sessionRes.rows) {
      const fullRes = await pool.query("SELECT key, value FROM app_session WHERE key = $1", [row.key]);
      const val = fullRes.rows[0].value;
      if (val.includes('eq')) {
        console.log(`Key ${row.key} contains 'eq'. Searching for context...`);
        // Find index of 'eq'
        let idx = -1;
        while ((idx = val.indexOf('eq', idx + 1)) !== -1) {
          console.log(`  Context around index ${idx}:`, val.substring(Math.max(0, idx - 40), Math.min(val.length, idx + 40)));
        }
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
