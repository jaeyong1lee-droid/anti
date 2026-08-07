const { Client } = require('c:/Users/airfo/OneDrive - 대우건설/안티/server/node_modules/pg');
const fs = require('fs');

const connectionString = 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';

const client = new Client({
  connectionString,
});

async function run() {
  await client.connect();
  try {
    const res = await client.query(`SELECT value FROM app_session WHERE key = 'exam_session'`);
    if (res.rows.length > 0) {
      fs.writeFileSync('c:/Users/airfo/OneDrive - 대우건설/안티/exam_session_dump.json', res.rows[0].value);
      console.log('Dumped to exam_session_dump.json');
    }
  } catch (err) {
    console.error('Error', err);
  } finally {
    await client.end();
  }
}

run();
