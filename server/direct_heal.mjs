import pg from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function run() {
  console.log('--- Direct Heal Start ---');
  const topicsRes = await pool.query('SELECT DISTINCT topic_id FROM schedules');
  let healed = 0;

  for (const row of topicsRes.rows) {
    const topic_id = row.topic_id;
    const maxRes = await pool.query(
      "SELECT MAX(review_round) as max_round FROM schedules WHERE topic_id = $1 AND status = 'completed' AND review_round < 90",
      [topic_id]
    );
    const maxRound = maxRes.rows[0]?.max_round;
    if (maxRound) {
      const updateRes = await pool.query(
        "UPDATE schedules SET status = 'completed', completed_at = NOW() WHERE topic_id = $1 AND review_round < $2 AND status = 'pending'",
        [topic_id, maxRound]
      );
      if (updateRes.rowCount > 0) {
        console.log(`[Healed] Topic ${topic_id}: marked ${updateRes.rowCount} skipped pending schedules (round < ${maxRound}) as completed`);
        healed += updateRes.rowCount;
      }
    }
  }

  const cleanupRes = await pool.query(
    "UPDATE schedules SET status = 'completed', completed_at = NOW() WHERE review_round >= 100 AND status = 'pending'"
  );
  if (cleanupRes.rowCount > 0) {
    console.log(`[Healed] Marked ${cleanupRes.rowCount} pending schedules with review_round >= 100 as completed`);
  }

  console.log(`--- Finished. Total healed: ${healed} ---`);
  await pool.end();
}

run().catch(console.error);
