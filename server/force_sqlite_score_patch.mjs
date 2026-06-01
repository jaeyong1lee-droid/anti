// 로컬 SQLite 데이터베이스의 Prandtl(16) 또는 싱글쉘(17) 스케줄을 완료 및 45점 세팅하여 약점 카드를 강제 발동시키는 스크립트
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
  // schedules 테이블에 topic_id 16(Prandtl) 또는 17(싱글쉘)인 스케줄 하나 조회
  db.get("SELECT id, topic_id FROM schedules WHERE topic_id = 16 OR topic_id = 17 LIMIT 1", [], (err, row) => {
    if (err) {
      console.error('Error querying schedules:', err.message);
      db.close();
      process.exit(1);
    }
    
    if (!row) {
      console.log('로컬 SQLite DB에 패치할 대상 스케줄(topic 16, 17)이 존재하지 않습니다.');
      db.close();
      process.exit(0);
    }
    
    console.log(`대상 스케줄을 발견했습니다: 스케줄 ID ${row.id}, 토픽 ID ${row.topic_id}`);
    
    // 강제로 completed 및 45점 세팅
    db.run(
      "UPDATE schedules SET status = 'completed', completed_at = DATETIME('now'), score = 45, correct_count = 4, total_count = 10 WHERE id = ?",
      [row.id],
      function(updateErr) {
        if (updateErr) {
          console.error('로컬 SQLite 패치 실패:', updateErr.message);
        } else {
          console.log(`\n🎉 [성공] 로컬 SQLite 스케줄 ID ${row.id}를 status = 'completed', score = 45점으로 강제 변환 완료!`);
        }
        db.close();
        process.exit(0);
      }
    );
  });
});
