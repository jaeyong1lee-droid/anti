import { initDatabase, dbQuery } from './database.js';

async function main() {
  await initDatabase();
  
  // 1. Check generation_standards cache
  const rowGen = await dbQuery.get("SELECT value FROM app_session WHERE key = 'generation_standards'");
  if (rowGen && rowGen.value) {
    console.log('[DB Info] Cached generation_standards found.');
    const parsed = JSON.parse(rowGen.value);
    const hasDefGen5 = parsed.some(s => s.id === 'def_gen_5');
    console.log('Does DB cache contain def_gen_5?', hasDefGen5);
    
    if (!hasDefGen5) {
      console.log('Purging stale generation_standards database cache...');
      await dbQuery.run("DELETE FROM app_session WHERE key = 'generation_standards'");
      console.log('Stale generation_standards cache successfully deleted.');
    }
  } else {
    console.log('[DB Info] No generation_standards database cache exists. Defaulting to file configuration.');
  }

  // 2. Check lockscreen_standards cache for safety
  const rowLock = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_standards'");
  if (rowLock && rowLock.value) {
    console.log('[DB Info] Cached lockscreen_standards found.');
  }
}

main().catch(console.error);
