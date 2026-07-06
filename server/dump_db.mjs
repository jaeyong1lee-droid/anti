import { dbQuery, initDatabase } from './database.js';

async function main() {
  await initDatabase();
  try {
    const rows = await dbQuery.all("SELECT value FROM app_session WHERE key = 'formula_overviews'");
    if (rows.length === 0) {
      console.log('No formula_overviews found in app_session.');
      return;
    }
    
    const parsed = JSON.parse(rows[0].value);
    const overviews = parsed.formulaOverviews || [];
    console.log(`\n=== Found ${overviews.length} overviews in DB ===\n`);
    
    overviews.forEach(ov => {
      console.log(`ID: ${ov.id} | Title: ${ov.title}`);
      console.log(`Content:\n${ov.content}`);
      console.log(`-----------------------------------------\n`);
    });
  } catch (err) {
    console.error('Error during database dump:', err);
  }
}

main();
