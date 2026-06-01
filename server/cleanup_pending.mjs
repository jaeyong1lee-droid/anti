// 로컬 SQLite DB 정리: 동일 토픽에 중복된 pending 일정을 가장 낮은 차수 하나만 남기고 나머지 삭제
// (클라우드 연결 복구 전까지 로컬 DB를 정상 상태로 복원)
import { dbQuery, initDatabase } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

await initDatabase();

// 동일 토픽에 pending이 2개 이상인 topic_id 추출 (PostgreSQL 호환 쿼리)
const dupes = await dbQuery.all(`
  SELECT topic_id, COUNT(*) as cnt
  FROM schedules
  WHERE status = 'pending'
  GROUP BY topic_id
  HAVING COUNT(*) > 1
`);

console.log(`\n정리 대상 토픽: ${dupes.length}개`);

for (const d of dupes) {
  // 해당 토픽의 pending 일정을 round ASC로 정렬 → 가장 낮은 1개만 유지
  const rows = await dbQuery.all(
    `SELECT id, review_round, planned_date FROM schedules WHERE topic_id = ? AND status = 'pending' ORDER BY review_round ASC`,
    [d.topic_id]
  );
  
  const [keep, ...remove] = rows;
  console.log(`\n  topic_id=${d.topic_id} → 유지: round=${keep.review_round}(#${keep.id}), 삭제: ${remove.map(r => `round=${r.review_round}(#${r.id})`).join(', ')}`);
  
  for (const r of remove) {
    await dbQuery.run(`DELETE FROM schedules WHERE id = ?`, [r.id]);
  }
}

console.log('\n✅ 중복 pending 정리 완료!');

// 정리 후 현황 출력
const kstNow = new Date(Date.now() + 9*60*60*1000);
const today = kstNow.toISOString().split('T')[0];
const remaining = await dbQuery.all(`
  SELECT s.id, t.title, s.review_round, s.planned_date
  FROM schedules s
  JOIN topics t ON s.topic_id = t.id
  WHERE s.planned_date <= ? AND s.status = 'pending'
  ORDER BY s.review_round ASC
`, [today]);

console.log(`\n📋 정리 후 오늘 대시보드 표시 대상: ${remaining.length}개`);
for (const r of remaining) {
  console.log(`  [#${r.id}] "${r.title.substring(0,25)}"  round=${r.review_round}  date=${r.planned_date}`);
}

process.exit(0);
