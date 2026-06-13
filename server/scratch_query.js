const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_9VB7MqNvTjtA@ep-misty-dawn-apk5itib-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL Database.');

  // Find the topic '가설흙막이'
  const topicsRes = await client.query("SELECT id, title FROM topics WHERE title LIKE '%가설흙막이%'");
  console.log('Topics found:', topicsRes.rows);

  if (topicsRes.rows.length > 0) {
    const topicId = topicsRes.rows[0].id;
    // Find all schedules of this topic
    const schedulesRes = await client.query(
      "SELECT id, topic_id, review_round, planned_date, completed_at, status, score, correct_count, total_count FROM schedules WHERE topic_id = $1 ORDER BY review_round ASC",
      [topicId]
    );
    console.log('Schedules:', schedulesRes.rows);
  }

  await client.end();
}

main().catch(err => {
  console.error(err);
  client.end();
});
