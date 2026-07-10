import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set in server/.env!');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Connecting to Neon PostgreSQL to optimize table storage...');
    
    // 1. Optimize topics table
    console.log('Checking topics table...');
    const topicsRes = await pool.query(
      `UPDATE topics 
       SET pdf_data = NULL 
       WHERE pdf_url IS NOT NULL AND pdf_url != '' AND pdf_data IS NOT NULL`
    );
    console.log(`Updated topics table: set pdf_data to NULL for ${topicsRes.rowCount} rows.`);

    // 2. Optimize answersheet_reports table
    console.log('Checking answersheet_reports table...');
    const reportsRes = await pool.query(
      `UPDATE answersheet_reports 
       SET pdf_data = NULL 
       WHERE pdf_url IS NOT NULL AND pdf_url != '' AND pdf_data IS NOT NULL`
    );
    console.log(`Updated answersheet_reports table: set pdf_data to NULL for ${reportsRes.rowCount} rows.`);

    console.log('Database optimization completed successfully.');
  } catch (err) {
    console.error('Error during database optimization:', err);
  } finally {
    await pool.end();
  }
}

run();
