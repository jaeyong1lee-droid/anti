import { Client } from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';

const client = new Client({ connectionString });

// Utils for date calculation matching server/utils/fileUtils.js logic
function getLocalDateString(baseDate, plusDays = 0) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + plusDays);
  const offset = date.getTimezoneOffset() * 60000; // in milliseconds
  const localISOTime = new Date(date.getTime() - offset).toISOString().split('T')[0];
  return localISOTime;
}

async function run() {
  await client.connect();
  console.log('Connected to Neon DB for schedule cleanup...');

  try {
    // 1. Get all topics
    const topicsRes = await client.query('SELECT id, title FROM topics ORDER BY id ASC');
    const topics = topicsRes.rows;
    console.log(`Found ${topics.length} topics to check.`);

    let fixedCount = 0;

    for (const topic of topics) {
      // 2. Get all schedules for the topic
      const schedRes = await client.query(
        'SELECT id, review_round, status, completed_at, planned_date FROM schedules WHERE topic_id = $1 ORDER BY review_round ASC',
        [topic.id]
      );
      const schedules = schedRes.rows;

      if (schedules.length === 0) continue; // No schedules yet

      // 3. Find the highest round that is completed or failed
      let highestCompletedRound = 0;
      let highestCompletedDate = null;

      for (const s of schedules) {
        if (s.status === 'completed' || s.status === 'failed') {
          if (s.review_round > highestCompletedRound) {
            highestCompletedRound = s.review_round;
            highestCompletedDate = s.completed_at || new Date(s.planned_date);
          }
        }
      }

      if (highestCompletedRound > 0 && highestCompletedRound < 99) {
        const nextRound = highestCompletedRound + 1;
        
        // 4. Check if the next round schedule exists
        const hasNextRound = schedules.some(s => s.review_round === nextRound);

        if (!hasNextRound) {
          console.log(`\n[Missing Schedule] Topic ID: ${topic.id} (${topic.title})`);
          console.log(` - Highest completed round: ${highestCompletedRound}`);
          console.log(` - Missing next round: ${nextRound}`);

          // Calculate delay days (Ebbinghaus logic)
          let days = 0;
          if (highestCompletedRound === 1) days = 4;
          else if (highestCompletedRound === 2) days = 7;
          else if (highestCompletedRound === 3) days = 14;
          else if (highestCompletedRound === 4) days = 35;
          else if (highestCompletedRound === 5) days = 60;
          else if (highestCompletedRound >= 6) {
            days = 45; // Default for missing old data
          }

          if (days > 0 && highestCompletedDate) {
            const nextPlannedDate = getLocalDateString(highestCompletedDate, days);
            console.log(` -> Inserting pending schedule for round ${nextRound} on ${nextPlannedDate}`);
            
            await client.query(`
              INSERT INTO schedules (topic_id, review_round, planned_date, status)
              VALUES ($1, $2, $3, 'pending')
            `, [topic.id, nextRound, nextPlannedDate]);
            
            fixedCount++;
          } else {
             console.log(` -> Could not calculate days or highestCompletedDate is null.`);
          }
        }
      }
    }
    
    console.log(`\nCleanup Complete! Successfully fixed ${fixedCount} missing schedules.`);

  } catch (err) {
    console.error('Error executing script:', err.stack);
  } finally {
    await client.end();
  }
}

run();
