const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require',
});
client.connect();
client.query(\SELECT value FROM app_session WHERE key LIKE 'review_questions_topic_24_sess_%'\, (err, res) => {
  if (err) throw err;
  for (let row of res.rows) {
    const questions = JSON.parse(row.value);
    console.log(JSON.stringify(questions[2], null, 2));
  }
  client.end();
});
