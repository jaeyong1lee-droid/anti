const pg = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const res = await pool.query("SELECT * FROM topics");
    console.log('Topics:');
    res.rows.forEach(t => {
      console.log(`- ID: ${t.id}, Title: ${t.title}`);
    });

    const sessions = await pool.query("SELECT key, updated_at FROM app_session");
    console.log('\nSessions:');
    sessions.rows.forEach(s => {
      console.log(`- Key: ${s.key}, Updated: ${s.updated_at}`);
    });

    // Let's search for '수압파쇄' in app_session table
    const searchRes = await pool.query("SELECT key, value FROM app_session WHERE value LIKE '%수압파쇄%'");
    console.log(`\nFound '수압파쇄' in ${searchRes.rows.length} sessions:`);
    searchRes.rows.forEach(r => {
      console.log(`- Key: ${r.key}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
