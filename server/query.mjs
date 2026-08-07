import { dbQuery, initDatabase } from './database.js';

async function run() {
  await initDatabase();
  const rows = await dbQuery.all(`
    SELECT id, topic_id, review_round, planned_date, completed_at, status 
    FROM schedules 
    WHERE topic_id IN (6, 7, 8, 9, 10, 12, 13) 
    ORDER BY topic_id, review_round
  `);
  console.table(rows);
}
run();
