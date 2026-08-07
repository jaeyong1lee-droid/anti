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
      
      // Remove $$ around tables
      newVal = newVal.replace(/\$\$\s*([\s\S]*?(?:\||┌|▼|↓|──)[\s\S]*?)\s*\$\$/g, '$1');
      
      // Fix u to \nu around 포아송
      if (newVal.includes('포아송')) {
        newVal = newVal.replace(/\$u\$/g, '$\\nu$');
        // Carefully replace u if it's explicitly 포아송비(u)
        newVal = newVal.replace(/포아송비\s*\(\s*u\s*\)/g, '포아송비(\\nu)');
        newVal = newVal.replace(/포아송비\s*u/g, '포아송비 \\nu');
        newVal = newVal.replace(/<br\/>u/g, '<br/>\\nu');
      }
      
      if (newVal !== s.value) {
        await client.query('UPDATE app_session SET value = $1 WHERE key = $2', [newVal, s.key]);
        updatedSessions++;
      }
    }
    console.log(`Updated ${updatedSessions} sessions.`);

  } finally {
    client.release();
    pool.end();
  }
}

run().catch(console.error);
