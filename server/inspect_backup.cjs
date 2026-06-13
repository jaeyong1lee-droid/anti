const fs = require('fs');
const path = require('path');

const backupPath = path.resolve(__dirname, 'backups', 'latest_neon_backup.json');

if (!fs.existsSync(backupPath)) {
  console.error('Backup file does not exist!');
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log('Keys in backup:', Object.keys(data));
  const tables = data.tables || {};
  console.log('Tables inside backup:', Object.keys(tables));

  if (tables.topics) {
    console.log('Total topics in backup:', tables.topics.length);
    const matched = tables.topics.filter(t => t.title.includes('가설') || t.title.includes('흙막이') || t.title.includes('탄소성'));
    console.log('Matched topics in backup:', matched);
    
    if (matched.length > 0) {
      const topicId = matched[0].id;
      if (tables.schedules) {
        const scheds = tables.schedules.filter(s => s.topic_id === topicId);
        console.log('Schedules for matched topic:', scheds);
      }
    }
  }
} catch (e) {
  console.error('Failed to parse or inspect backup:', e);
}
