import { dbQuery } from './server/database.js';

async function checkTopic50() {
  try {
    const t50 = await dbQuery.get('SELECT id, title, category FROM topics WHERE id = 50');
    console.log('Topic 50:', t50);

    const topicsAll = await dbQuery.all('SELECT id, title, category FROM topics WHERE id IN (50, 51, 52, 53, 57)');
    console.log('Topics 50-53, 57:', topicsAll);

    const s50 = await dbQuery.all("SELECT key, substr(value, 1, 300) as val_short FROM app_session WHERE key LIKE '%50%' OR key LIKE '%topic_50%' OR key LIKE '%schedule_50%'");
    console.log('Sessions for Topic 50 count:', s50.length);
    s50.forEach(s => {
      console.log('KEY:', s.key);
      console.log('VAL:', s.val_short);
      console.log('-------------------');
    });

  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

checkTopic50();
