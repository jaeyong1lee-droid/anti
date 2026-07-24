import pg from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_9VB7MqNvTjtA@ep-misty-dawn-apk5itib-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  console.log('Testing connection to Neon PostgreSQL (ep-misty-dawn)...');
  const res = await pool.query('SELECT current_database(), now()');
  console.log('SUCCESS! Connected to Neon PostgreSQL:', res.rows[0]);
  const topicCount = await pool.query('SELECT count(*) FROM topics');
  console.log('Topics count in database:', topicCount.rows[0].count);
} catch (err) {
  console.error('Connection failed:', err.message);
} finally {
  await pool.end();
}
