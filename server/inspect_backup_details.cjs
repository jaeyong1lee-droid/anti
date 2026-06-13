const fs = require('fs');
const path = require('path');

const backupPath = path.resolve(__dirname, 'backups', 'latest_neon_backup.json');

try {
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const tables = data.tables || {};
  console.log('=== Backup Details ===');
  console.log('Timestamp:', data.timestamp);
  
  if (tables.topics) {
    console.log('Topics count in backup:', tables.topics.length);
    tables.topics.forEach(t => {
      console.log(`Topic ID: ${t.id}, Title: "${t.title}", PDF Name: "${t.pdf_name}", pdf_data size: ${t.pdf_data ? t.pdf_data.length : 0}`);
    });
  }
  
  if (tables.schedules) {
    console.log('\nSchedules count in backup:', tables.schedules.length);
    // Print a few schedules
    console.log('Sample schedules:', tables.schedules.slice(0, 5));
  }
} catch (e) {
  console.error(e);
}
