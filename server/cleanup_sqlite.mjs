// 로컬 SQLite 중복 pending 정리 (sqlite3 콜백 방식)
import sqlite3pkg from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const sqlite3 = sqlite3pkg.verbose();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');
console.log('SQLite 경로:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) { console.error('DB 연결 실패:', err.message); process.exit(1); }
  console.log('SQLite 연결 성공\n');
});

const run = (sql, params = []) => new Promise((res, rej) =>
  db.run(sql, params, function(err) { if (err) rej(err); else res(this); }));
const all = (sql, params = []) => new Promise((res, rej) =>
  db.all(sql, params, (err, rows) => { if (err) rej(err); else res(rows); }));

// 중복 pending 확인
const dupes = await all(`
  SELECT topic_id, COUNT(*) as cnt
  FROM schedules WHERE status = 'pending'
  GROUP BY topic_id HAVING COUNT(*) > 1
`);

console.log(`정리 대상 토픽: ${dupes.length}개`);

for (const d of dupes) {
  const rows = await all(
    `SELECT id, review_round FROM schedules WHERE topic_id = ? AND status = 'pending' ORDER BY review_round ASC`,
    [d.topic_id]
  );
  const [keep, ...remove] = rows;
  console.log(`  topic_id=${d.topic_id} → 유지: round=${keep.review_round}(#${keep.id}), 삭제: ${remove.map(r=>`round=${r.review_round}(#${r.id})`).join(', ')}`);
  for (const r of remove) {
    await run(`DELETE FROM schedules WHERE id = ?`, [r.id]);
  }
}

// 정리 결과 확인
const kstNow = new Date(Date.now() + 9*60*60*1000);
const today = kstNow.toISOString().split('T')[0];
const remaining = await all(`
  SELECT s.id, t.title, s.review_round, s.planned_date
  FROM schedules s JOIN topics t ON s.topic_id = t.id
  WHERE s.planned_date <= ? AND s.status = 'pending'
  ORDER BY s.review_round ASC
`, [today]);

console.log(`\n✅ 정리 완료! 오늘 대시보드 표시 대상: ${remaining.length}개`);
for (const r of remaining) {
  console.log(`  [#${r.id}] "${r.title.substring(0,25)}"  round=${r.review_round}  date=${r.planned_date}`);
}

db.close();
process.exit(0);
