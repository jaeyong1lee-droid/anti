import pg from 'pg';

const conn1 = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';
const conn2 = 'postgresql://neondb_owner:npg_9VB7MqNvTjtA@ep-misty-dawn-apk5itib-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function test(name, connectionString) {
  console.log(`\n--- Testing ${name} ---`);
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });
  try {
    const res = await pool.query('SELECT current_database(), now()');
    console.log(`✅ [SUCCESS] ${name}:`, res.rows[0]);
    const topics = await pool.query('SELECT count(*) FROM topics');
    console.log(`   Topics count:`, topics.rows[0].count);
    return true;
  } catch (err) {
    console.log(`❌ [FAILED] ${name}:`, err.message);
    return false;
  } finally {
    await pool.end();
  }
}

await test('ep-broad-credit (conn1)', conn1);
await test('ep-misty-dawn (conn2)', conn2);
