import pg from 'pg';

async function run() {
  const connectionString = 'postgresql://neondb_owner:npg_9VB7MqNvTjtA@ep-misty-dawn-apk5itib-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
  const client = new pg.Client({ connectionString });
  
  try {
    await client.connect();
    
    console.log("=== Fetching topics matching '여굴' or '압밀' ===");
    const topicRes = await client.query(
      "SELECT id, title FROM topics WHERE title LIKE '%여굴%' OR title LIKE '%압밀%'"
    );
    console.table(topicRes.rows);
    
    for (const topic of topicRes.rows) {
      console.log(`\n=== Schedules for topic: ${topic.title} (ID: ${topic.id}) ===`);
      const schedRes = await client.query(
        "SELECT id, review_round, planned_date, completed_at, status, score FROM schedules WHERE topic_id = $1 ORDER BY review_round ASC",
        [topic.id]
      );
      console.table(schedRes.rows);
    }
  } catch (error) {
    console.error("DB query failed:", error);
  } finally {
    await client.end();
  }
}

run();
