import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

async function run() {
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    const res = await pool.query('SELECT key, value FROM app_session');
    for (const row of res.rows) {
      const filepath = path.resolve(__dirname, '../scratch', `session_${row.key}.json`);
      fs.writeFileSync(filepath, JSON.stringify(row.value, null, 2));
      console.log(`Wrote session key: ${row.key} to ${filepath}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
