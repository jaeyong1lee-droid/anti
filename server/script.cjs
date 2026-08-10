const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require',
});
client.connect();
client.query("SELECT key, value FROM app_session WHERE key = 'review_questions_schedule_63_sess_sess_topic_24_round_3'", (err, res) => {
  if (err) throw err;
  for (let row of res.rows) {
    const questions = JSON.parse(row.value);
    console.log(JSON.stringify(questions[10], null, 2)); // Q11
  }
  client.end();
});
