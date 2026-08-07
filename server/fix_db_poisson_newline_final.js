import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("Checking app_session...");
    const sessions = await client.query('SELECT key, value FROM app_session');
    let updatedSessions = 0;
    
    for (const s of sessions.rows) {
      if (!s.value) continue;
      let newVal = s.value;
      
      const before = newVal;
      
      // Match \n in JSON string: regex is /\\n/
      newVal = newVal.replace(/\$\\n\s*u/g, '$\\\\nu');
      newVal = newVal.replace(/\\n\s*u'/g, '\\\\nu\'');
      newVal = newVal.replace(/\(\\n\s*u\)/g, '(\\\\nu)');
      newVal = newVal.replace(/포아송비\s*\\n\s*u/g, '포아송비 \\\\nu');
      newVal = newVal.replace(/포아송비\(\s*\\n\s*u\s*\)/g, '포아송비(\\\\nu)');
      newVal = newVal.replace(/<br\/>\\n\s*u/g, '<br/>\\\\nu');
      newVal = newVal.replace(/또는\s*\\n\s*u/g, '또는 \\\\nu');
      newVal = newVal.replace(/\\n\s*u\)/g, '\\\\nu)');
      newVal = newVal.replace(/<br\/>\s*\\n\s*u/g, '<br/>\\\\nu');
      newVal = newVal.replace(/\\n\s*u\s*\\le/g, '\\\\nu \\\\le');
      newVal = newVal.replace(/\\frac\{\\n\s*u/g, '\\\\frac{\\\\nu');
      newVal = newVal.replace(/\\n\s*u/g, '\\\\nu'); // global catch-all

      if (newVal !== before) {
        await client.query('UPDATE app_session SET value = $1 WHERE key = $2', [newVal, s.key]);
        updatedSessions++;
      }
    }
    console.log(`Updated ${updatedSessions} app_session.`);
  } finally {
    client.release();
    pool.end();
  }
}

run().catch(console.error);
