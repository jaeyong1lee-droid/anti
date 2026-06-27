import { dbQuery, initDatabase } from './database.js';

async function listKeys() {
  await initDatabase();
  try {
    const keys = await dbQuery.all("SELECT key FROM app_session");
    console.log('All App Session Keys:');
    console.table(keys);
  } catch (err) {
    console.error(err);
  }
}

listKeys();
