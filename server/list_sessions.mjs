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

pool.query("SELECT key FROM app_session", [], (err, res) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('Found', res.rows.length, 'session keys:');
  res.rows.forEach(r => {
    console.log('-', r.key);
  });
  pool.end();
});
