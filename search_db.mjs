import { dbQuery } from './server/database.js';

async function searchDB() {
  try {
    const sessions = await dbQuery.all("SELECT key, value FROM app_session WHERE value LIKE '%과소평가%' OR value LIKE '%유효응력 증가%'");
    console.log('Sessions found:', sessions.length);
    for (const s of sessions) {
      if (s.value.includes('과소평가') || s.value.includes('유효응력 증가')) {
        console.log('Key:', s.key);
        // Find the snippet
        const idx = Math.max(0, s.value.indexOf('유효응력 증가') - 50);
        console.log('Snippet:', s.value.substring(idx, idx + 100));
      }
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

searchDB();
