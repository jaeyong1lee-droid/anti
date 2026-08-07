import { pool } from './server/database.js';
import fs from 'fs';

async function run() {
  try {
    const res = await pool.query("SELECT id, calc_items, flowchart_data FROM questions WHERE question_text LIKE '%침투수량%' LIMIT 10");
    fs.writeFileSync('db_dump.json', JSON.stringify(res.rows, null, 2));
    console.log('Dumped to db_dump.json');
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
