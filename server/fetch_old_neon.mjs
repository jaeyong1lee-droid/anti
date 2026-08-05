import pg from 'pg';

const oldConn = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function fetchOldData() {
  console.log('Connecting to old Neon DB:', oldConn);
  const pool = new pg.Pool({
    connectionString: oldConn.replace(/[?&]channel_binding=[^&]*/g, ''),
    ssl: { rejectUnauthorized: false }
  });

  try {
    const resTopics = await pool.query('SELECT id, title, category, created_at FROM topics ORDER BY id ASC');
    console.log(`✅ Success! Fetched ${resTopics.rows.length} topics from old Neon DB:`);
    resTopics.rows.forEach(r => console.log(`  [ID ${r.id}] ${r.title}`));
    
    const resSchedules = await pool.query('SELECT count(*) as cnt FROM schedules');
    console.log(`Schedules count: ${resSchedules.rows[0].cnt}`);

    const resSessions = await pool.query('SELECT count(*) as cnt FROM app_session');
    console.log(`Sessions count: ${resSessions.rows[0].cnt}`);
  } catch (err) {
    console.error('❌ Query failed:', err.message);
  } finally {
    await pool.end();
  }
}

fetchOldData();
