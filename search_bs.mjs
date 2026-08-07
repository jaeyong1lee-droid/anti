import { dbQuery } from './server/database.js';

async function findBackslashZeung() {
  try {
    const sessions = await dbQuery.all("SELECT key, value FROM app_session WHERE value LIKE '%증가%'");
    for (const s of sessions) {
      if (s.value.includes('\\\\증가') || s.value.includes('\\증가')) {
        console.log('Found in key:', s.key);
        // regex to find context
        const regex = /.{0,30}\\+증가.{0,30}/g;
        let match;
        while ((match = regex.exec(s.value)) !== null) {
          console.log('Snippet:', match[0]);
        }
      }
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

findBackslashZeung();
