import { dbQuery, initDatabase } from '../server/database.js';

async function main() {
  await initDatabase();
  console.log("=== DB QUERY START ===");
  const rows = await dbQuery.all('SELECT * FROM app_session');
  for (const row of rows) {
    console.log(`KEY: ${row.key}`);
    console.log(`VALUE length: ${row.value ? row.value.length : 0}`);
    if (row.key === 'formula_questions') {
      console.log(JSON.stringify(JSON.parse(row.value), null, 2).substring(0, 1000));
    }
  }
  console.log("=== DB QUERY END ===");
}

main().catch(err => {
  console.error("Error in main:", err);
});
