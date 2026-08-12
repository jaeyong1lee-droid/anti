require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' });
pool.query(`SELECT data FROM questions WHERE data LIKE '%시간-침하비%' LIMIT 1`, (err, res) => {
  if(err) {
    console.error(err);
  } else if (res.rows.length > 0) {
    console.log(res.rows[0].data);
  } else {
    console.log("No data found in questions table.");
    // Try in topics table
    pool.query(`SELECT content FROM topics WHERE content LIKE '%시간-침하비%' LIMIT 1`, (err2, res2) => {
      if (res2 && res2.rows.length > 0) console.log(res2.rows[0].content);
      else console.log("Not found in topics.");
      pool.end();
    });
  }
  if (res && res.rows.length > 0) pool.end();
});
