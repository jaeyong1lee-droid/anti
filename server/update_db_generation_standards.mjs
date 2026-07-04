import { dbQuery, initDatabase } from './database.js';
import { generationStandardsList } from './plugins/generationStandards.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

await initDatabase();

console.log('Fetching existing generation_standards...');
const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'generation_standards'");
if (row && row.value) {
  console.log('Found existing row in DB. Updating it with current file content...');
  const res = await dbQuery.run(
    "UPDATE app_session SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'generation_standards'",
    [JSON.stringify(generationStandardsList)]
  );
  console.log('Update result:', res);
} else {
  console.log('No existing row found. Inserting...');
  const res = await dbQuery.run(
    "INSERT INTO app_session (key, value, updated_at) VALUES ('generation_standards', ?, CURRENT_TIMESTAMP)",
    [JSON.stringify(generationStandardsList)]
  );
  console.log('Insert result:', res);
}

process.exit(0);
