import { dbQuery, initDatabase } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

await initDatabase();

console.log('--- APP_SESSION ---');
const appSession = await dbQuery.all('SELECT key, length(value) as len FROM app_session');
console.log(JSON.stringify(appSession, null, 2));

process.exit(0);
