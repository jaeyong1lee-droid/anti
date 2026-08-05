import pg from 'pg';

const newConnectionString = 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';

const pgPool = new pg.Pool({
  connectionString: newConnectionString,
  ssl: { rejectUnauthorized: false }
});

async function checkCounts() {
  try {
    const topicsRes = await pgPool.query('SELECT COUNT(*) FROM topics');
    const schedRes = await pgPool.query('SELECT COUNT(*) FROM schedules');
    const sessRes = await pgPool.query('SELECT COUNT(*) FROM app_session');

    console.log('===================================================');
    console.log('📊 [NEW Neon DB Table Row Counts]');
    console.log('   - topics count:', topicsRes.rows[0].count);
    console.log('   - schedules count:', schedRes.rows[0].count);
    console.log('   - app_session count:', sessRes.rows[0].count);
    console.log('===================================================');
  } catch (e) {
    console.error('Error querying NEW Neon DB:', e.message);
  } finally {
    await pgPool.end();
  }
}

checkCounts();
