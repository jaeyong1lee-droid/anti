const path = require('path');
const pgPath = path.resolve(__dirname, '..', 'server', 'node_modules', 'pg');
const pg = require(pgPath);

const pool = new pg.Pool({
  connectionString: 'postgresql://neondb_owner:npg_9VB7MqNvTjtA@ep-misty-dawn-apk5itib-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT key FROM app_session", (err, res) => {
  if (err) {
    console.error("Error querying PG:", err);
    process.exit(1);
  }
  console.log("Keys in app_session:", res.rows);
  pool.end();
});
