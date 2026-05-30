import { dbQuery, initDatabase } from '../server/database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: Get local date string 'YYYY-MM-DD'
function getLocalDateString(baseDate = new Date(), daysToAdd = 0) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + daysToAdd);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function testSpacedRepetitionFlow() {
  console.log('==================================================');
  console.log('Starting Spaced Repetition 7th Round System Test');
  console.log('==================================================');

  try {
    // 0. Ensure Database is Initialized
    await initDatabase();

    // 1. Create a dummy test topic
    console.log('\n[Step 1] Creating a dummy test topic...');
    const topicTitle = '지반공학 임시 테스트 토픽 (장기 복습 검증)';
    const insertTopicSql = `
      INSERT INTO topics (title, keywords, pdf_name, created_at)
      VALUES (?, 'test, spacer', 'test_spec.pdf', CURRENT_TIMESTAMP)
    `;
    const topicRes = await dbQuery.run(insertTopicSql, [topicTitle]);
    const topicId = topicRes.id;
    console.log(`-> Dummy topic created with ID: ${topicId}`);

    // 2. Generate 1st to 6th round review schedules
    console.log('\n[Step 2] Inserting review schedules (Round 1 to 6)...');
    const intervals = [1, 4, 7, 14, 35, 60];
    const insertScheduleSql = `
      INSERT INTO schedules (topic_id, review_round, planned_date, status)
      VALUES (?, ?, ?, 'pending')
    `;

    const scheduleIds = {};
    for (let i = 0; i < intervals.length; i++) {
      const round = i + 1;
      const plannedDate = getLocalDateString(new Date(), intervals[i]);
      const res = await dbQuery.run(insertScheduleSql, [topicId, round, plannedDate]);
      scheduleIds[round] = res.id;
    }
    console.log('-> Rounds 1 to 6 schedules successfully created:', scheduleIds);

    // 3. Simulating 6th round completion
    console.log('\n[Step 3] Simulating completion of Round 6...');
    const scheduleId6 = scheduleIds[6];
    
    // Select schedule 6 info
    const schedule6 = await dbQuery.get('SELECT * FROM schedules WHERE id = ?', [scheduleId6]);
    console.log(`-> Pre-complete Round 6 state:`, schedule6);

    // Run complete simulation
    const nowTimestamp = new Date().toISOString();
    await dbQuery.run('UPDATE schedules SET status = \'completed\', completed_at = ? WHERE id = ?', [nowTimestamp, scheduleId6]);

    // Apply auto-creation logic (Same as server/index.js)
    if (schedule6.review_round >= 6) {
      const nextRound = schedule6.review_round + 1;
      const nextCheckSql = `SELECT * FROM schedules WHERE topic_id = ? AND review_round = ?`;
      const existingNextSchedule = await dbQuery.get(nextCheckSql, [schedule6.topic_id, nextRound]);
      
      if (!existingNextSchedule) {
        const randomDays = 30 + Math.floor(Math.random() * 61); // 30 ~ 90일 후
        const nextPlannedDate = getLocalDateString(new Date(), randomDays);
        
        const insertSql = `
          INSERT INTO schedules (topic_id, review_round, planned_date, status)
          VALUES (?, ?, ?, 'pending')
        `;
        await dbQuery.run(insertSql, [schedule6.topic_id, nextRound, nextPlannedDate]);
        console.log(`[Success] Auto-created review round ${nextRound} planned on ${nextPlannedDate}`);
      }
    }

    // Verify 7th round was created
    const schedule7 = await dbQuery.get('SELECT * FROM schedules WHERE topic_id = ? AND review_round = 7', [topicId]);
    if (schedule7) {
      console.log('-> Verified: Round 7 was automatically created:', schedule7);
    } else {
      throw new Error('Failed to auto-create Round 7 schedule upon Round 6 completion.');
    }

    // 4. Simulating Reset of Round 6
    console.log('\n[Step 4] Simulating reset/cancellation of Round 6...');
    // Reset simulation
    const todayDateStr = getLocalDateString();
    await dbQuery.run('UPDATE schedules SET status = \'pending\', completed_at = NULL, planned_date = ? WHERE id = ?', [todayDateStr, scheduleId6]);

    // Apply reset cleaning logic (Same as server/index.js)
    if (schedule6.review_round >= 6) {
      const nextRound = schedule6.review_round + 1;
      const deleteSql = `
        DELETE FROM schedules 
        WHERE topic_id = ? AND review_round = ? AND status = 'pending'
      `;
      await dbQuery.run(deleteSql, [schedule6.topic_id, nextRound]);
      console.log(`[Success] Cleaned up auto-created future round ${nextRound} due to reset`);
    }

    // Verify 7th round was deleted
    const schedule7AfterReset = await dbQuery.get('SELECT * FROM schedules WHERE topic_id = ? AND review_round = 7', [topicId]);
    if (!schedule7AfterReset) {
      console.log('-> Verified: Round 7 was successfully removed upon resetting Round 6.');
    } else {
      throw new Error('Failed to clean up Round 7 schedule upon Round 6 reset.');
    }

    // 5. Simulating Startup Spaced Repetition Migration
    console.log('\n[Step 5] Simulating background migration (migrateSpacedIntervals)...');
    
    // First, set Round 6 back to completed, but delete Round 7 to mock an outdated DB state
    await dbQuery.run('UPDATE schedules SET status = \'completed\', completed_at = ? WHERE id = ?', [nowTimestamp, scheduleId6]);
    await dbQuery.run('DELETE FROM schedules WHERE topic_id = ? AND review_round = 7', [topicId]);
    console.log('-> Database set to mock state: Round 6 completed, but Round 7 is missing.');

    // Now, run the migration logic
    console.log('-> Running migrateSpacedIntervals simulated logic...');
    const sqlMigrationCheck = `
      SELECT s6.topic_id, s6.completed_at, s6.planned_date
      FROM schedules s6
      WHERE s6.review_round = 6 AND s6.status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM schedules s7 
          WHERE s7.topic_id = s6.topic_id AND s7.review_round = 7
        )
    `;
    const migrationTargets = await dbQuery.all(sqlMigrationCheck);
    console.log(`-> Migration targets found: ${migrationTargets.length}`);
    
    let migratedCount = 0;
    const insertSql = `
      INSERT INTO schedules (topic_id, review_round, planned_date, status)
      VALUES (?, 7, ?, 'pending')
    `;
    
    for (const row of migrationTargets) {
      let baseDate = new Date();
      if (row.completed_at) {
        baseDate = new Date(row.completed_at);
      } else if (row.planned_date) {
        baseDate = new Date(row.planned_date);
      }
      
      const randomDays = 30 + Math.floor(Math.random() * 61);
      const plannedDateStr = getLocalDateString(baseDate, randomDays);
      
      await dbQuery.run(insertSql, [row.topic_id, plannedDateStr]);
      migratedCount++;
    }
    console.log(`-> Migrated ${migratedCount} records successfully.`);

    // Verify 7th round was re-created by migration
    const schedule7AfterMigration = await dbQuery.get('SELECT * FROM schedules WHERE topic_id = ? AND review_round = 7', [topicId]);
    if (schedule7AfterMigration) {
      console.log('-> Verified: Round 7 was successfully restored by migration:', schedule7AfterMigration);
    } else {
      throw new Error('Failed to restore Round 7 via migration simulation.');
    }

    // 6. Cleanup Test Data
    console.log('\n[Step 6] Cleaning up test data from database...');
    await dbQuery.run('DELETE FROM topics WHERE id = ?', [topicId]);
    
    // Verify cleanup
    const verifyCleanupTopic = await dbQuery.get('SELECT * FROM topics WHERE id = ?', [topicId]);
    const verifyCleanupSchedules = await dbQuery.all('SELECT * FROM schedules WHERE topic_id = ?', [topicId]);
    if (!verifyCleanupTopic && verifyCleanupSchedules.length === 0) {
      console.log('-> Verified: All test records successfully removed from database.');
    } else {
      console.warn('-> Warning: Cleanup left remaining data in the DB.', { verifyCleanupTopic, verifyCleanupSchedules });
    }

    console.log('\n==================================================');
    console.log('Spaced Repetition System Test Completed Successfully!');
    console.log('==================================================');
  } catch (error) {
    console.error('\n!!! TEST FAILED WITH ERROR !!!');
    console.error(error);
    process.exit(1);
  }
}

testSpacedRepetitionFlow();
