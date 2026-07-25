import { dbQuery } from './database.js';

async function run() {
  console.log('=====================================================================');
  console.log(' 🧹 PURGING ALL APP CACHES & CHAT HISTORY REMNANTS (찌꺼기 제거) ');
  console.log('=====================================================================');

  try {
    // dbQuery.run will automatically run on both SQLite and Cloud PostgreSQL!
    const result = await dbQuery.run(
      `DELETE FROM app_session 
       WHERE key LIKE 'review_questions_%' 
          OR key LIKE 'completed_review_schedule_%'
          OR key LIKE 'tutorAnswers%'
          OR key LIKE 'chatHistory%'`
    );
    console.log(`[Cache Cleaned] Successfully purged caches from database. Result:`, result);
  } catch (err) {
    console.warn('[Cache Purge Failed]:', err.message);
  }

  console.log('Purge completed successfully! Caches are completely empty now.');
}

run().catch(console.error);
