import { dbQuery, initDatabase } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
  await initDatabase();
  try {
    console.log("\n================ [ Table Size Info ] ================");
    // Query table sizes in PostgreSQL
    const tableSizes = await dbQuery.all(`
      SELECT 
        table_name,
        pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as total_size,
        pg_size_pretty(pg_relation_size(quote_ident(table_name))) as data_size,
        pg_size_pretty(pg_indexes_size(quote_ident(table_name))) as index_size
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.table(tableSizes);

    console.log("\n================ [ Row Counts ] ================");
    const tables = ['topics', 'schedules', 'app_session'];
    for (const t of tables) {
      const countRow = await dbQuery.get(`SELECT COUNT(*) as count FROM ${t}`);
      console.log(`Table: ${t} | Rows: ${countRow.count}`);
    }

    console.log("\n================ [ Largest Keys in app_session ] ================");
    const largestKeys = await dbQuery.all(`
      SELECT 
        key, 
        length(value) as char_length,
        pg_size_pretty(length(value)::bigint) as pretty_size
      FROM app_session 
      ORDER BY length(value) DESC 
      LIMIT 15
    `);
    console.table(largestKeys);

    console.log("\n================ [ Key Groups by Size ] ================");
    const keyGroups = await dbQuery.all(`
      SELECT 
        CASE 
          WHEN key LIKE 'completed_review_schedule_%' THEN 'completed_review_schedule_%'
          WHEN key LIKE 'review_questions_topic_%' THEN 'review_questions_topic_%'
          WHEN key LIKE 'review_questions_schedule_%' THEN 'review_questions_schedule_%'
          WHEN key LIKE 'extracted_text_%' THEN 'extracted_text_%'
          ELSE key 
        END as key_type,
        COUNT(*) as key_count,
        pg_size_pretty(SUM(length(value))::bigint) as total_size
      FROM app_session
      GROUP BY key_type
      ORDER BY SUM(length(value)) DESC
    `);
    console.table(keyGroups);

  } catch (e) {
    console.error("Analysis failed:", e);
  }
}
run();
