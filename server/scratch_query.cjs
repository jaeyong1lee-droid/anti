const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_9VB7MqNvTjtA@ep-misty-dawn-apk5itib-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL Database.');

  const topicsRes = await client.query("SELECT id, title FROM topics ORDER BY id ASC");
  console.log('All Topics:', topicsRes.rows);

  await client.end();
}

main().catch(err => {
  console.error(err);
  client.end();
});
