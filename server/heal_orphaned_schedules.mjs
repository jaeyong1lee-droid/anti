import { dbQuery, initDatabase } from './database.js';

async function heal() {
  await initDatabase();
  console.log('--- Starting Schedule Healing ---');
  
  const topics = await dbQuery.all('SELECT DISTINCT topic_id FROM schedules');
  let healedCount = 0;
  
  for (const row of topics) {
    const topic_id = row.topic_id;
    const maxCompleted = await dbQuery.get(
      "SELECT MAX(review_round) as max_round FROM schedules WHERE topic_id = ? AND status = 'completed' AND review_round < 90",
      [topic_id]
    );
    
    if (maxCompleted && maxCompleted.max_round) {
      const res = await dbQuery.run(
        "UPDATE schedules SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE topic_id = ? AND review_round < ? AND status = 'pending'",
        [topic_id, maxCompleted.max_round]
      );
      if (res.changes > 0) {
        console.log(`[Healed] Topic ${topic_id}: marked ${res.changes} skipped pending schedules (round < ${maxCompleted.max_round}) as completed`);
        healedCount += res.changes;
      }
    }
  }

  const cleanup100 = await dbQuery.run(
    "UPDATE schedules SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE review_round >= 100 AND status = 'pending'"
  );
  if (cleanup100.changes > 0) {
    console.log(`[Healed] Marked ${cleanup100.changes} pending schedules with review_round >= 100 as completed`);
  }

  console.log(`--- Healing finished. Total healed: ${healedCount} ---`);
  process.exit(0);
}

heal().catch(err => {
  console.error('Healing failed:', err);
  process.exit(1);
});
