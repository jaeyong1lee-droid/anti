import { dbQuery, initDatabase } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

await initDatabase();

const rows = await dbQuery.all('SELECT id, title, created_at FROM topics ORDER BY id DESC');
console.log("PostgreSQL Topics:");
console.log(JSON.stringify(rows, null, 2));

process.exit(0);
