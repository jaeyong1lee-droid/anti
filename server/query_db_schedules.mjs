import pg from 'pg';

async function run() {
  const connectionString = 'postgresql://neondb_owner:npg_9VB7MqNvTjtA@ep-misty-dawn-apk5itib-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
  const client = new pg.Client({ connectionString });
  
  try {
    await client.connect();
    
    console.log("=== Fetching all topics from topics table ===");
    const topicRes = await client.query("SELECT id, title FROM topics");
    console.table(topicRes.rows);
    
    if (topicRes.rows.length > 0) {
      const topicIds = topicRes.rows.map(r => r.id);
      console.log("\n=== Schedules for all topics ===");
      const schedRes = await client.query(
        "SELECT id, topic_id, review_round, planned_date, completed_at, status, score FROM schedules ORDER BY topic_id ASC, review_round ASC"
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
