import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env.production') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in env!");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('Running patch_topics_3_24 against live PostgreSQL Database...');
  try {
    const baseDateStr = '2026-06-29 00:00:00';
    const roundDates = {
      2: '2026-07-03',
      3: '2026-07-10',
      4: '2026-07-24',
      5: '2026-08-28',
      6: '2026-10-27',
    };

    const res = await pool.query(
      "SELECT id, topic_id, review_round, status, score FROM schedules WHERE topic_id >= 3 AND topic_id <= 24 AND review_round < 99 ORDER BY topic_id, review_round"
    );
    const schedules = res.rows;
    console.log(`Found ${schedules.length} schedules to check/patch.`);

    let patchCount1 = 0;
    let patchCount2 = 0;
    let deletedSessions = 0;

    for (const s of schedules) {
      if (s.review_round === 1) {
        const finalScore = (s.score && s.score > 0) ? s.score : 100;
        await pool.query(
          "UPDATE schedules SET status = 'completed', completed_at = $1, score = $2 WHERE id = $3",
          [baseDateStr, finalScore, s.id]
        );
        patchCount1++;
      } else if (s.review_round >= 2 && s.review_round <= 6) {
        const correctPlannedDate = roundDates[s.review_round];
        await pool.query(
          "UPDATE schedules SET status = 'pending', completed_at = NULL, score = NULL, correct_count = NULL, total_count = NULL, planned_date = $1 WHERE id = $2",
          [correctPlannedDate, s.id]
        );

        const keysToDelete = [
          `completed_review_schedule_${s.id}`,
          `review_questions_schedule_${s.id}`
        ];
        for (const k of keysToDelete) {
          const delRes = await pool.query("DELETE FROM app_session WHERE key = $1", [k]);
          deletedSessions += delRes.rowCount || 0;
        }
        patchCount2++;
      }
    }

    await pool.query(
      "INSERT INTO app_session (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP",
      ['patch_reset_topics_3_24_done', 'true']
    );

    console.log(`Successfully completed patch:`);
    console.log(`- 1st rounds completed: ${patchCount1}`);
    console.log(`- 2nd-6th rounds reset to pending: ${patchCount2}`);
    console.log(`- Deleted sessions: ${deletedSessions}`);

  } catch (e) {
    console.error('Error executing PostgreSQL patch:', e);
  } finally {
    pool.end();
  }
}

run();
