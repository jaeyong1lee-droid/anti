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
    console.log("Connecting to PostgreSQL...");
    
    // List all databases
    const dbs = await pool.query("SELECT datname FROM pg_database WHERE datistemplate = false");
    console.log("\n--- Databases in PostgreSQL instance ---");
    console.table(dbs.rows);

    // Check if we are connected to the right schema/search path
    const searchPath = await pool.query("SHOW search_path");
    console.log("\nSearch path:", searchPath.rows);

    // List schemas
    const schemas = await pool.query("SELECT schema_name FROM information_schema.schemata");
    console.log("\nSchemas:", schemas.rows.map(r => r.schema_name));

  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
