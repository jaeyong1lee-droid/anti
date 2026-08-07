import { dbQuery } from './server/database.js';

async function purgeCorruptedSessions() {
  try {
    console.log('[Migration] Starting cleanup of corrupted category mismatch session keys...');
    
    const allTopics = await dbQuery.all('SELECT id, title, category, keywords FROM topics ORDER BY id ASC');
    const topicMap = new Map();
    allTopics.forEach(t => topicMap.set(t.id, t));

    const sessions = await dbQuery.all("SELECT key, value FROM app_session WHERE key LIKE 'review_questions_%'");
    
    let purgedCount = 0;

    for (const sess of sessions) {
      const key = sess.key;
      let topicId = null;

      if (key.includes('topic_mixed_')) {
        const match = key.match(/mixed_(\d+)/);
        if (match) topicId = parseInt(match[1]);
      } else if (key.includes('topic_')) {
        const match = key.match(/topic_(\d+)/);
        if (match) topicId = parseInt(match[1]);
      } else if (key.includes('schedule_')) {
        const match = key.match(/schedule_(\d+)/);
        if (match) {
          const schedId = parseInt(match[1]);
          const sched = await dbQuery.get('SELECT topic_id FROM schedules WHERE id = ?', [schedId]);
          if (sched) topicId = sched.topic_id;
        }
      }

      if (!topicId) continue;
      const topic = topicMap.get(topicId);
      if (!topic) continue;

      try {
        const parsed = JSON.parse(sess.value);
        let questions = [];
        if (Array.isArray(parsed)) {
          questions = parsed;
        } else if (parsed && Array.isArray(parsed.questions)) {
          questions = parsed.questions;
        }

        if (questions.length === 0) continue;

        let shouldPurge = false;

        for (const q of questions) {
          const qStr = JSON.stringify(q);
          const isCalcQuestion = q.type === '주관식 (계산)' || 
                                 qStr.includes('수치 계산') || 
                                 qStr.includes('Terzaghi') || 
                                 qStr.includes('허용지지력 q_all') ||
                                 (q.tableData && q.tableData.headers && q.tableData.headers[1] === '계산 결과 및 답안');

          if (topic.category === '일반' && isCalcQuestion) {
            shouldPurge = true;
            break;
          }
          if (topic.category === '계산' && !isCalcQuestion && questions.length !== 4) {
            shouldPurge = true;
            break;
          }
          if (!topic.title.includes('지지력') && qStr.includes('Terzaghi')) {
            shouldPurge = true;
            break;
          }
        }

        if (shouldPurge) {
          console.log(`[Purging Key] ${key} for Topic #${topic.id} (${topic.category}): ${topic.title}`);
          await dbQuery.run('DELETE FROM app_session WHERE key = ? OR key = ?', [key, `${key}_q`]);
          purgedCount++;
        }
      } catch (e) {}
    }

    console.log(`\n[Migration Complete] Successfully purged ${purgedCount} corrupted session keys from DB.`);

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

purgeCorruptedSessions();
