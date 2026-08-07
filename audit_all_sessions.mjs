import { dbQuery } from './server/database.js';

async function auditAllSessions() {
  try {
    const allTopics = await dbQuery.all('SELECT id, title, category, keywords FROM topics ORDER BY id ASC');
    const topicMap = new Map();
    allTopics.forEach(t => topicMap.set(t.id, t));

    console.log(`Total topics in DB: ${allTopics.length}`);

    const sessions = await dbQuery.all("SELECT key, value FROM app_session WHERE key LIKE 'review_questions_%'");
    console.log(`Total review session keys in app_session: ${sessions.length}`);

    let totalMismatches = 0;
    const mismatchedKeys = [];

    for (const sess of sessions) {
      const key = sess.key;
      let topicId = null;

      // Extract topic_id or schedule_id from key
      if (key.includes('topic_mixed_')) {
        // e.g. review_questions_topic_mixed_50-02_sess_...
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

        let hasCategoryMismatch = false;
        let mismatchReason = '';

        for (const q of questions) {
          const qStr = JSON.stringify(q);
          const isCalcQuestion = q.type === '주관식 (계산)' || 
                                 qStr.includes('수치 계산') || 
                                 qStr.includes('Terzaghi') || 
                                 qStr.includes('허용지지력 q_all') ||
                                 (q.tableData && q.tableData.headers && q.tableData.headers[1] === '계산 결과 및 답안');

          if (topic.category === '일반' && isCalcQuestion) {
            hasCategoryMismatch = true;
            mismatchReason = `Topic #${topic.id} '${topic.title}' is Category '일반', but quiz contains calculation question!`;
            break;
          }

          if (topic.category === '계산' && !isCalcQuestion && questions.length !== 4) {
            hasCategoryMismatch = true;
            mismatchReason = `Topic #${topic.id} '${topic.title}' is Category '계산', but quiz format is invalid (length ${questions.length})!`;
            break;
          }

          // Check title / subject mismatch (e.g. topic title vs question keywords)
          if (topic.id === 50 && (qStr.includes('Terzaghi') || qStr.includes('정방형 기초'))) {
            hasCategoryMismatch = true;
            mismatchReason = `Topic #50 tunnel topic contains Terzaghi bearing capacity question!`;
            break;
          }
        }

        if (hasCategoryMismatch) {
          totalMismatches++;
          mismatchedKeys.push({ key, topicId: topic.id, title: topic.title, category: topic.category, reason: mismatchReason });
        }
      } catch (e) {}
    }

    console.log(`\n--- AUDIT RESULTS ---`);
    console.log(`Total Mismatched Session Keys Found: ${totalMismatches}`);
    mismatchedKeys.forEach(m => {
      console.log(`[MISMATCH KEY]: ${m.key} | Topic #${m.topicId} (${m.category}): ${m.title} -> Reason: ${m.reason}`);
    });

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    process.exit(0);
  }
}

auditAllSessions();
