import { dbQuery } from './server/database.js';

async function findRawText() {
  try {
    const rows = await dbQuery.all("SELECT id, extracted_text FROM topics WHERE extracted_text LIKE '%Square Footing%'");
    for (const row of rows) {
      console.log(`\n--- Topic ID: ${row.id} ---`);
      const match = row.extracted_text.match(/.{0,150}Square Footing.{0,150}/g);
      console.log("Match:", match);
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

findRawText();
