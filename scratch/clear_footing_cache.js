import { dbQuery } from '../server/database.js';

async function run() {
  try {
    // 1. Find the topic "확대기초 아래 흙의 거동 및 파괴"
    const topic = await dbQuery.get(
      "SELECT id, title FROM topics WHERE title LIKE '%확대기초 아래 흙의 거동%' OR title LIKE '%확대기초%'"
    );

    if (!topic) {
      console.log("Topic '확대기초 아래 흙의 거동 및 파괴' not found in database.");
      process.exit(0);
    }

    console.log(`Found Topic ID: ${topic.id} - "${topic.title}"`);

    // 2. Delete cached review questions from app_session
    const key = `review_questions_topic_${topic.id}`;
    const result = await dbQuery.run("DELETE FROM app_session WHERE key = ?", [key]);
    
    console.log(`Successfully cleared cached review questions. rows affected: ${result.changes}`);
    process.exit(0);
  } catch (err) {
    console.error("Error clearing database cache:", err);
    process.exit(1);
  }
}

run();
