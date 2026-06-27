import { dbQuery, initDatabase } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

await initDatabase();

console.log("=== ALL TOPICS IN POSTGRES ===");
const rows = await dbQuery.all('SELECT id, title, pdf_name, category FROM topics ORDER BY id ASC');
rows.forEach(r => {
  console.log(`ID: ${r.id}, Title: ${r.title}, PDF: ${r.pdf_name}, Category: ${r.category}`);
});

process.exit(0);
