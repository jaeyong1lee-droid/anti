import { Client } from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';

const client = new Client({
  connectionString,
});

async function run() {
  await client.connect();
  console.log('Connected to Neon DB');

  try {
    const res = await client.query(`SELECT id, question, explanation FROM quizzes WHERE explanation LIKE '%히빙%' OR question LIKE '%히빙%'`);
    console.log(`Found ${res.rowCount} quizzes`);
    
    for (const row of res.rows) {
      console.log(`\n--- Quiz ID: ${row.id} ---`);
      if (row.question && row.question.includes('내부의분모')) {
        console.log('QUESTION MATCHES:');
        console.log(row.question);
      }
      if (row.explanation && row.explanation.includes('내부의분모')) {
        console.log('EXPLANATION MATCHES:');
        console.log(row.explanation);
      }
    }
  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

run();
