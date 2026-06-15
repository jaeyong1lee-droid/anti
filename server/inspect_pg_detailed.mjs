import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;
console.log('Connecting to Postgres database...');

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    // List tables in public schema
    const tablesRes = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    );
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log('Postgres tables:', tables);

    for (const table of tables) {
      const countRes = await pool.query(`SELECT COUNT(*) FROM "${table}"`);
      console.log(`Table "${table}" has ${countRes.rows[0].count} rows.`);
      
      // If it has rows, print a sample
      if (parseInt(countRes.rows[0].count, 10) > 0) {
        const sampleRes = await pool.query(`SELECT * FROM "${table}" LIMIT 2`);
        console.log(`Sample from "${table}":`, JSON.stringify(sampleRes.rows, null, 2).substring(0, 1000));
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
