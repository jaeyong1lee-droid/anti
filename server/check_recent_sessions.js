const dbQuery = require('./utils/database');

async function checkSessions() {
  try {
    const rows = await dbQuery.all(`
      SELECT key, updated_at 
      FROM app_session 
      WHERE key LIKE 'review_questions_schedule_%' 
         OR key LIKE 'review_questions_topic_%' 
         OR key LIKE 'completed_review_schedule_%' 
      ORDER BY updated_at DESC LIMIT 10
    `);
    console.log("Recent sessions:", rows);
    
    // Also get the titles of the recent ones
    for (const row of rows) {
      let scheduleId = null;
      let topicId = null;
      
      if (row.key.startsWith('completed_review_schedule_')) {
        scheduleId = row.key.replace('completed_review_schedule_', '').split('_sess_')[0];
      } else if (row.key.startsWith('review_questions_schedule_')) {
        scheduleId = row.key.replace('review_questions_schedule_', '').split('_sess_')[0];
      } else if (row.key.startsWith('review_questions_topic_')) {
        topicId = row.key.replace('review_questions_topic_', '').split('_sess_')[0];
      }
      
      if (scheduleId && scheduleId.startsWith('mixed_')) continue;
      
      if (scheduleId) {
        const sched = await dbQuery.get(`SELECT topic_id FROM schedules WHERE id = ?`, [parseInt(scheduleId)]);
        if (sched) {
          const topic = await dbQuery.get(`SELECT title FROM topics WHERE id = ?`, [sched.topic_id]);
          console.log(row.key, "->", topic ? topic.title : 'unknown topic');
        }
      } else if (topicId) {
        const topic = await dbQuery.get(`SELECT title FROM topics WHERE id = ?`, [parseInt(topicId)]);
        console.log(row.key, "->", topic ? topic.title : 'unknown topic');
      }
    }
  } catch (err) {
    console.error(err);
  }
}

checkSessions();
