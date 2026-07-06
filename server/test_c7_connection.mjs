import pg from 'pg';

const connString = 'postgresql://neondb_owner:npg_9VB7MqNvTjtA@ep-misty-dawn-apk5itib-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';
console.log('Testing connection to c-7 database...');
const pool = new pg.Pool({
  connectionString: connString,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Connection failed with error:', err.message);
  } else {
    console.log('Connection succeeded! Time:', res.rows[0].now);
  }
  pool.end();
});
