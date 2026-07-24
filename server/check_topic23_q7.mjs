import pg from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  console.log('--- Checking Topic 23 in Cloud PostgreSQL ---');
  const topicRes = await pool.query('SELECT * FROM topics WHERE id = 23 OR title LIKE \'%간극수압%\'');
  console.log('Topics found:', topicRes.rows.map(t => ({ id: t.id, title: t.title })));

  const sessionRes = await pool.query('SELECT key, length(value) as len FROM app_session WHERE key LIKE \'%topic_23%\' OR key LIKE \'%review%\' OR key LIKE \'%schedule_141%\'');
  console.log('App session keys found:', sessionRes.rows);

  for (const row of sessionRes.rows) {
    if (row.key.includes('topic_23') || row.key.includes('141')) {
      const detail = await pool.query('SELECT value FROM app_session WHERE key = $1', [row.key]);
      console.log(`\n=== Key: ${row.key} ===`);
      const val = detail.rows[0].value;
      console.log(val.substring(0, 800));
    }
  }
} catch (err) {
  console.error('Database query error:', err);
} finally {
  await pool.end();
}
