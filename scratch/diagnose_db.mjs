import { dbQuery, initDatabase } from '../server/database.js';

async function diagnose() {
  try {
    await initDatabase();
    
    console.log('=== 1. All Completed Schedules with Scores ===');
    const allCompleted = await dbQuery.all(
      `SELECT id, topic_id, review_round, status, completed_at, score 
       FROM schedules 
       WHERE status = 'completed' AND score IS NOT NULL
       ORDER BY completed_at DESC`
    );
    console.log(allCompleted);

    console.log('\n=== 2. Completed History Inner Subquery (Latest per Topic) ===');
    const subqueryRows = await dbQuery.all(
      `SELECT topic_id, score, completed_at, rn
       FROM (
         SELECT topic_id, score, completed_at,
                ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY completed_at DESC) as rn
         FROM schedules
         WHERE status = 'completed' AND score IS NOT NULL AND review_round <> 99
       ) t
       WHERE rn = 1`
    );
    console.log(subqueryRows);

    console.log('\n=== 3. Completed History Final Query (Latest with score < 100) ===');
    const finalRows = await dbQuery.all(
      `SELECT topic_id, score as min_score
       FROM (
         SELECT topic_id, score,
                ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY completed_at DESC) as rn
         FROM schedules
         WHERE status = 'completed' AND score IS NOT NULL AND review_round <> 99
       ) t
       WHERE rn = 1 AND score < 100
       ORDER BY score ASC
       LIMIT 5`
    );
    console.log(finalRows);
    
  } catch (err) {
    console.error('Diagnosis failed:', err);
  }
}

diagnose();
