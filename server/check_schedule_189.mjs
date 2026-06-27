import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL env variable is missing!');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    const client = await pool.connect();
    console.log('Connected to Neon Postgres database.');
    
    const res = await client.query('SELECT * FROM schedules WHERE id = 189');
    if (res.rows.length > 0) {
      console.log('--- SCHEDULE 189 DATA ---');
      console.log(res.rows[0]);
    } else {
      console.log('Schedule 189 not found in database.');
      // Get recent updates
      const recent = await client.query('SELECT id, status, review_round, planned_date, topic_id FROM schedules ORDER BY id DESC LIMIT 5');
      console.log('--- MOST RECENT SCHEDULES ---');
      console.log(recent.rows);
    }
    client.release();
  } catch (err) {
    console.error('Failed to query database:', err.message);
  } finally {
    await pool.end();
  }
}

run();
