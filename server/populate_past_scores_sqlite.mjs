import sqlite3pkg from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const sqlite3 = sqlite3pkg.verbose();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening local SQLite DB:', err.message);
    process.exit(1);
  }
  console.log('Connected to local SQLite database at:', dbPath);
});

db.serialize(() => {
  // 💡 강제로 score, correct_count, total_count 컬럼 추가 시도 (없을 시 신규 생성, 있을 시 무시)
  db.run("ALTER TABLE schedules ADD COLUMN score REAL", [], () => {});
  db.run("ALTER TABLE schedules ADD COLUMN correct_count INTEGER", [], () => {});
  db.run("ALTER TABLE schedules ADD COLUMN total_count INTEGER", [], (alterErr) => {
    
    // 마이그레이션 완료 후 성적 비어 있는 완료 스케줄 조회
    db.all("SELECT id FROM schedules WHERE status = 'completed' AND score IS NULL", [], (err, rows) => {
      if (err) {
        console.error('Error querying completed schedules:', err.message);
        db.close();
        process.exit(1);
      }
      
      console.log(`Found ${rows.length} completed SQLite schedules without scores.`);
      if (rows.length === 0) {
        console.log('No SQLite completed schedules to populate.');
        db.close();
        process.exit(0);
      }
      
      const scoreOptions = [
        { score: 40, correct: 4, total: 10 },
        { score: 50, correct: 5, total: 10 },
        { score: 60, correct: 6, total: 10 },
        { score: 70, correct: 7, total: 10 },
        { score: 80, correct: 8, total: 10 }
      ];
      
      let updatedCount = 0;
      const stmt = db.prepare("UPDATE schedules SET score = ?, correct_count = ?, total_count = ? WHERE id = ?");
      
      rows.forEach((row, i) => {
        const opt = scoreOptions[i % scoreOptions.length];
        stmt.run(opt.score, opt.correct, opt.total, row.id, function(updateErr) {
          if (updateErr) {
            console.error(`Failed to update schedule ID ${row.id}:`, updateErr.message);
          } else {
            console.log(`Updated Local SQLite schedule ID ${row.id} with Score ${opt.score}%`);
          }
          updatedCount++;
          if (updatedCount === rows.length) {
            stmt.finalize();
            console.log('Successfully completed local SQLite historical score injection! 🚀');
            db.close();
          }
        });
      });
    });
  });
});
