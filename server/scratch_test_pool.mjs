import { initDatabase, dbQuery } from './database.js';

async function runTest() {
  try {
    console.log('Starting Spaced Repetition Backend on port 5001...');
    process.env.PORT = '5001';
    
    // Import index.js to launch the server
    await import('./index.js');
    
    console.log('Waiting 35 seconds for initial pool replenishment on startup...');
    await new Promise(resolve => setTimeout(resolve, 35000));
    
    // Check pool from database
    const poolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
    if (poolRow && poolRow.value) {
      const pool = JSON.parse(poolRow.value);
      console.log(`[Database Check] Pregenerated pool contains ${pool.length} questions.`);
    } else {
      console.log('[Database Check] Pregenerated pool is empty or not created yet.');
    }
    
    console.log('Sending API request to fetch 1 question...');
    const start = Date.now();
    const res = await fetch('http://localhost:5001/api/lockscreen/sync?count=1');
    const data = await res.json();
    const elapsed = Date.now() - start;
    
    console.log(`Response status: ${res.status} in ${elapsed} ms`);
    console.log('API Response:', JSON.stringify(data, null, 2));

    console.log('Waiting another 25 seconds for background replenishment to finish...');
    await new Promise(resolve => setTimeout(resolve, 25000));

    // Check pool again
    const poolRowAfter = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
    if (poolRowAfter && poolRowAfter.value) {
      const poolAfter = JSON.parse(poolRowAfter.value);
      console.log(`[Database Check After Fetch] Pregenerated pool contains ${poolAfter.length} questions.`);
    }
    
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    process.exit(0);
  }
}

runTest();
