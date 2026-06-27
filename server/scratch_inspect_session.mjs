import { dbQuery, initDatabase } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

await initDatabase();

console.log("=== APP SESSIONS ===");
const rows = await dbQuery.all('SELECT key, value FROM app_session');
for (const r of rows) {
  console.log(`\nKEY: ${r.key}`);
  try {
    const val = JSON.parse(r.value);
    if (val.selectedTopic) {
      console.log("  selectedTopic title:", val.selectedTopic.title);
      console.log("  selectedTopic category:", val.selectedTopic.category);
      console.log("  selectedTopic pdf_name:", val.selectedTopic.pdf_name);
    }
    if (val.questions) {
      console.log(`  Questions count: ${val.questions.length}`);
      val.questions.forEach((q, idx) => {
        console.log(`    Q[${idx}]: type=${q.type}, subtype=${q.subtype}, question=${q.question ? q.question.substring(0, 100) : ''}`);
        if (q.category) console.log(`      category=${q.category}`);
        if (q.pdf_name) console.log(`      pdf_name=${q.pdf_name}`);
      });
    }
  } catch (e) {
    console.log("  Raw value (first 500 chars):", r.value.substring(0, 500));
  }
}

process.exit(0);
