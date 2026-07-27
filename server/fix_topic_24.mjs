import pg from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function run() {
  console.log('--- Fixing Topic 24 Schedules ---');
  
  // 1. Update Round 2 (id: 163): score 96.7, completed_at 2026-07-26 12:02:49 UTC (2026-07-27 KST), status completed
  await pool.query(
    `UPDATE schedules 
     SET score = 96.7, correct_count = 13, total_count = 13, status = 'completed', completed_at = '2026-07-26 12:02:49.021Z'
     WHERE topic_id = 24 AND review_round = 2`
  );
  
  // 2. Reset Round 3 (id: 164): pending, score null, completed_at null, planned_date = '2026-08-03' (7 days after 2026-07-27)
  await pool.query(
    `UPDATE schedules 
     SET score = NULL, correct_count = NULL, total_count = NULL, status = 'pending', completed_at = NULL, planned_date = '2026-08-03'
     WHERE topic_id = 24 AND review_round = 3`
  );

  // 3. Reset Round 4 (id: 165): planned_date = '2026-08-17' (14 days after Round 3)
  await pool.query(
    `UPDATE schedules 
     SET planned_date = '2026-08-17'
     WHERE topic_id = 24 AND review_round = 4`
  );

  // 4. Update session key mapping from schedule_164 to schedule_163 if exists
  await pool.query(
    `UPDATE app_session SET key = 'completed_review_schedule_163' WHERE key = 'completed_review_schedule_164'`
  );

  console.log('Topic 24 schedules fixed successfully!');
  await pool.end();
}

run().catch(console.error);
