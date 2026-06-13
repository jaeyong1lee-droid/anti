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

  // 1. Check app_session table in backup
  if (tables.app_session) {
    console.log('\n--- Session keys in backup ---');
    tables.app_session.forEach(row => {
      console.log(`Key: "${row.key}", Value length: ${row.value ? row.value.length : 0}`);
      if (row.key === 'answersheet_questions') {
        const val = JSON.parse(row.value);
        const questions = val.answersheetQuestions || [];
        console.log(`Found answersheet_questions in backup! Number of items: ${questions.length}`);
        questions.forEach((q, idx) => {
          console.log(`[${idx + 1}] Title: "${q.title}", Report ID: ${q.answersheet_report_id}`);
        });
      }
    });
  } else {
    console.log('No app_session table found in backup!');
  }

  // 2. Check answersheet_reports in backup
  if (tables.answersheet_reports) {
    console.log(`\n--- answersheet_reports in backup (${tables.answersheet_reports.length} rows) ---`);
    tables.answersheet_reports.forEach(row => {
      console.log(`ID: ${row.id}, pdf_name: "${row.pdf_name}", created_at: ${row.created_at}`);
    });
  } else {
    console.log('No answersheet_reports table found in backup!');
  }

} catch (e) {
  console.error('Error inspecting backup:', e);
}
