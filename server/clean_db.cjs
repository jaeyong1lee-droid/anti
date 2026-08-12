require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function cleanDatabase() {
  try {
    console.log("Starting DB scan for corrupted KaTeX fractions in app_session table...");

    const tRes = await pool.query(`SELECT key, value FROM app_session WHERE value LIKE '%\\\\frac%' OR value LIKE '%\\frac%'`);
    let tUpdated = 0;
    
    console.log(`Found ${tRes.rows.length} rows with \\frac in app_session.`);
    
    for (let row of tRes.rows) {
      if (!row.value) continue;
      
      let newValue = row.value;
      const oldValue = newValue;
      
      newValue = newValue.replace(/\\\\frac{t}{\\\\,S}/g, 't/S');
      newValue = newValue.replace(/\\\\frac{t}{,S}/g, 't/S');
      newValue = newValue.replace(/\\\\frac{t}{_S}/g, 't/S');
      newValue = newValue.replace(/\\\\frac{t}{S}/g, 't/S');
      newValue = newValue.replace(/\\\\frac{t}{S_t}/g, 't/S_t');
      newValue = newValue.replace(/\\\\frac{t}{S_{t}}/g, 't/S_{t}');
      
      if (oldValue !== newValue) {
        await pool.query(`UPDATE app_session SET value = $1 WHERE key = $2`, [newValue, row.key]);
        tUpdated++;
        console.log(`Updated app_session key: ${row.key}`);
      }
    }
    console.log(`Finished app_session table. Total updated: ${tUpdated}`);

  } catch (err) {
    console.error("Database error:", err);
  } finally {
    pool.end();
  }
}

cleanDatabase();
