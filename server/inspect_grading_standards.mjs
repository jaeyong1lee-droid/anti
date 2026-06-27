import { dbQuery, initDatabase, isPostgres } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

await initDatabase();

console.log('isPostgres:', isPostgres);
const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'grading_standards'");
if (row && row.value) {
  const list = JSON.parse(row.value);
  console.log('Length:', list.length);
  console.log('Titles:', list.map(item => item.title));
} else {
  console.log('No grading_standards found');
}
process.exit(0);
