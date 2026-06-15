import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

const connectionString = process.env.DATABASE_URL;
console.log('Connecting to Postgres database...');

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    // 1. Search in topics
    console.log('Searching in topics table...');
    const topicsRes = await pool.query("SELECT id, title, substring(content from 1 for 200) as content_short FROM topics WHERE content LIKE '%침투%' OR title LIKE '%침투%'");
    console.log(`Found ${topicsRes.rows.length} matching topics:`);
    topicsRes.rows.forEach(t => console.log(`ID: ${t.id}, Title: ${t.title}`));

    // 2. Search in app_session table
    console.log('\nSearching in app_session table...');
    const sessionRes = await pool.query("SELECT key, value FROM app_session");
    console.log(`Total sessions in app_session: ${sessionRes.rows.length}`);
    
    let matchesCount = 0;
    for (const row of sessionRes.rows) {
      if (row.value && (row.value.includes('침투') || row.value.includes('평가 지표') || row.value.includes('한계 동수경사'))) {
        console.log(`\nMatch found in session key: ${row.key}`);
        try {
          const parsed = JSON.parse(row.value);
          const questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.answersheetQuestions || []);
          console.log(`Session contains ${questions.length} questions.`);
          questions.forEach((q, idx) => {
            if (q.question && (q.question.includes('침투') || q.question.includes('평가 지표') || q.question.includes('한계 동수경사'))) {
              matchesCount++;
              console.log(`--- [Q${idx + 1}] ---`);
              console.log(`Type: ${q.type}`);
              console.log(`Question: ${q.question}`);
              console.log(`tableData:`, JSON.stringify(q.tableData));
              console.log(`answers:`, JSON.stringify(q.answers));
            }
          });
        } catch (e) {
          console.log(`Failed to parse session value: ${e.message}`);
        }
      }
    }
    console.log(`\nTotal matching questions: ${matchesCount}`);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
