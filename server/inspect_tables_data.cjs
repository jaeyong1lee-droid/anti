const fs = require('fs');
const path = require('path');

const backups = [
  'latest_neon_backup.json',
  'neon_backup_2026-06-03T03-04-47-497Z.json'
];

backups.forEach(filename => {
  const backupPath = path.resolve(__dirname, 'backups', filename);
  if (!fs.existsSync(backupPath)) {
    console.log(`Backup file ${filename} does not exist.`);
    return;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const tables = data.tables || {};
    console.log(`\n=== File: ${filename} ===`);
    console.log('Timestamp:', data.timestamp);
    console.log('Tables:', Object.keys(tables));
    
    if (tables.app_session) {
      console.log('app_session rows count:', tables.app_session.length);
      console.log('app_session rows:', JSON.stringify(tables.app_session, null, 2));
    } else {
      console.log('No app_session table in backup.');
    }
  } catch (e) {
    console.error(`Error reading ${filename}:`, e.message);
  }
});
