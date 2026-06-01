// 사용자가 이전에 복습했던 일정 중 1개를 강제로 completed 및 45점으로 세팅하여 약점 보완 카드 시뮬레이션을 즉시 발동시키는 테스트 유틸리티
import { dbQuery, initDatabase } from './database.js';

async function run() {
  try {
    console.log('DB 연결 초기화 중...');
    await initDatabase();
    
    // 현재 pending 상태인 스케줄 하나 조회
    const pendingSchedules = await dbQuery.all(`
      SELECT s.id, t.title 
      FROM schedules s 
      JOIN topics t ON s.topic_id = t.id 
      WHERE s.status = 'pending'
      LIMIT 1
    `);
    
    if (pendingSchedules.length === 0) {
      console.log('성적을 소급 주입할 대상 pending 스케줄이 존재하지 않습니다.');
      process.exit(0);
    }
    
    const target = pendingSchedules[0];
    const scoreVal = 45; // 사용자가 45점(과락)을 맞았다고 가장하여 약점 유도
    const correctVal = 4;
    const totalVal = 10;
    
    // 강제 완료 및 45점 성적 주입
    await dbQuery.run(
      "UPDATE schedules SET status = 'completed', completed_at = CURRENT_TIMESTAMP, score = ?, correct_count = ?, total_count = ? WHERE id = ?",
      [scoreVal, correctVal, totalVal, target.id]
    );
    
    console.log(`\n🎉 [성공] 스케줄 ID ${target.id} ("${target.title}")를 status = 'completed', score = 45점으로 강제 변경 완료!`);
    console.log('이제 대시보드 페이지를 새로고침하시면 이 항목이 "💡 약점 보완 추천 (이전 점수: 45점)" 보라색 카드로 상단에 화려하게 출현합니다. 🚀');
    process.exit(0);
  } catch (err) {
    console.error('과거 복습 점수 강제 주입 실패:', err);
    process.exit(1);
  }
}

run();
