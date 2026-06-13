import { dbQuery, isPostgres } from '../server/database.js';

async function main() {
  console.log("Database type:", isPostgres ? "Postgres" : "SQLite");
  try {
    // 1. Search in topics
    const topics = await dbQuery.all("SELECT id, title FROM topics WHERE title LIKE '%이중층%' OR title LIKE '%Gouy%'");
    console.log("Topics found:", topics);

    // 2. Search in app_session keys
    const sessions = await dbQuery.all("SELECT key FROM app_session");
    console.log("Session keys:", sessions.map(s => s.key));

    // For each review session, parse and check if it contains the broken question
    for (const s of sessions) {
      if (s.key.includes('review_questions_') || s.key.includes('completed_review_')) {
        const row = await dbQuery.get("SELECT value FROM app_session WHERE key = ?", [s.key]);
        if (row && row.value) {
          try {
            const parsed = JSON.parse(row.value);
            const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
            console.log(`\nSession ${s.key} has ${questions.length} questions:`);
            questions.forEach((q, idx) => {
              if (q.question && (q.question.includes('Gouy') || q.question.includes('이중층'))) {
                console.log(`  [Q${idx+1}] Type: ${q.type}`);
                console.log(`  Question text: ${q.question.substring(0, 150)}...`);
                console.log(`  tableData:`, q.tableData);
              }
            });
          } catch (e) {
            console.error(`Error parsing session ${s.key}:`, e.message);
          }
        }
      }
    }
  } catch (e) {
    console.error("Error running DB search:", e);
  }
}

main();
