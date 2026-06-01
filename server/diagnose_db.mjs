// DB 상태 진단 스크립트 - pending 일정 현황 전체 출력
import { dbQuery, initDatabase } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

await initDatabase();

console.log('\n=== 📊 DB 현황 진단 ===\n');

// 1. 전체 pending 일정
const pending = await dbQuery.all(`
  SELECT s.id, s.topic_id, t.title, s.review_round, s.planned_date, s.status
  FROM schedules s
  JOIN topics t ON s.topic_id = t.id
  WHERE s.status = 'pending'
  ORDER BY t.title, s.review_round ASC
`);
console.log(`📌 총 pending 일정: ${pending.length}개`);
for (const r of pending) {
  console.log(`  [sched#${r.id}] "${r.title.substring(0,25)}"  round=${r.review_round}  date=${r.planned_date}`);
}

// 3. 오늘 대시보드 기준
const kstNow = new Date(Date.now() + 9*60*60*1000);
const today = kstNow.toISOString().split('T')[0];
console.log(`\n📅 오늘(KST): ${today}`);

const todayDue = await dbQuery.all(`
  SELECT s.id, t.title, s.review_round, s.planned_date
  FROM schedules s
  JOIN topics t ON s.topic_id = t.id
  WHERE s.planned_date <= ? AND s.status = 'pending'
  ORDER BY s.review_round ASC
`, [today]);
console.log(`\n✅ 대시보드 표시 대상 (planned_date <= 오늘, pending): ${todayDue.length}개`);
for (const r of todayDue) {
  console.log(`  [sched#${r.id}] "${r.title.substring(0,25)}"  round=${r.review_round}  date=${r.planned_date}`);
}

process.exit(0);
