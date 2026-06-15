import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

async function main() {
  console.log('Connecting to PostgreSQL...');
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const tablesRes = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log('Tables:', tables);
    
    for (const table of tables) {
      const colsRes = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND data_type IN ('text', 'character varying', 'json', 'jsonb')
      `, [table]);
      const cols = colsRes.rows.map(c => c.column_name);
      
      for (const col of cols) {
        try {
          const matchRes = await pool.query(`SELECT COUNT(*) FROM "${table}" WHERE CAST("${col}" AS TEXT) LIKE '%d_{H,max1}%'`);
          const count = parseInt(matchRes.rows[0].count, 10);
          if (count > 0) {
            console.log(`\n=== Match in Table: ${table}, Column: ${col} (Count: ${count}) ===`);
            const rowsRes = await pool.query(`SELECT * FROM "${table}" WHERE CAST("${col}" AS TEXT) LIKE '%d_{H,max1}%' LIMIT 5`);
            rowsRes.rows.forEach((row, idx) => {
              console.log(`[Row ${idx + 1}]`);
              console.log(JSON.stringify(row, null, 2));
            });
          }
        } catch (e) {
          // ignore
        }
      }
    }
  } catch (err) {
    console.error('PG Error:', err);
  } finally {
    await pool.end();
  }
}

main();
