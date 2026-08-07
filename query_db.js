const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require' });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT id, title, content
    FROM topics
    WHERE content LIKE '%내부의 분모%'
    LIMIT 5
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);
