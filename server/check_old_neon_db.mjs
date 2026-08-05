import pg from 'pg';

const oldConn = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';
const newConn = 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function main() {
  console.log('=== Checking OLD Neon DB (ep-broad-credit-aw98bx45 in us-east-1) ===');
  const oldPool = new pg.Pool({ connectionString: oldConn, ssl: { rejectUnauthorized: false } });
  
  try {
    const oldTopics = await oldPool.query('SELECT id, title, category, created_at FROM topics ORDER BY id ASC');
    const oldSchedules = await oldPool.query('SELECT count(*) as cnt FROM schedules');
    const oldSessions = await oldPool.query('SELECT count(*) as cnt FROM app_session');
    
    console.log(`OLD DB Total Topics: ${oldTopics.rows.length}`);
    console.log(`OLD DB Total Schedules: ${oldSchedules.rows[0].cnt}`);
    console.log(`OLD DB Total Sessions: ${oldSessions.rows[0].cnt}`);

    if (oldTopics.rows.length > 0) {
      console.log('OLD DB Topic List:');
      oldTopics.rows.forEach(r => console.log(`  [ID ${r.id}] ${r.title}`));
    }
  } catch (err) {
    console.error('Error reading OLD DB:', err.message);
  } finally {
    await oldPool.end();
  }
}

main();
