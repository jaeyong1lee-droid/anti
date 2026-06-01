// 과거 완료된 복습 스케줄에 실감 나는 채점 성적(40%~80%) 분포를 주입하여 대시보드 약점 카드를 즉시 활성화하는 스크립트
process.env.DATABASE_URL = '';
process.env.POSTGRES_URL = '';
process.env.POSTGRES_PRISMA_URL = '';
process.env.SUPABASE_DATABASE_URL = '';

import { dbQuery, initDatabase } from './database.js';

async function run() {
  try {
    console.log('DB 연결 초기화 중...');
    await initDatabase();
    
    console.log('성적이 비어 있는 과거 완료(completed) 복습 스케줄 조회 중...');
    const completedList = await dbQuery.all(
      "SELECT * FROM schedules WHERE status = 'completed' AND score IS NULL"
    );
    
    console.log(`성적이 비어 있는 과거 완료 스케줄 ${completedList.length}건을 발견했습니다.`);
    
    if (completedList.length === 0) {
      console.log('성적을 주입할 대상 완료 스케줄이 존재하지 않습니다.');
      process.exit(0);
    }
    
    // 사실적인 점수 옵션 (약점 추천 알고리즘을 테스트하기 위해 고르게 낮은 분포 제공)
    const scoreOptions = [
      { score: 40, correct: 4, total: 10 },
      { score: 50, correct: 5, total: 10 },
      { score: 60, correct: 6, total: 10 },
      { score: 70, correct: 7, total: 10 },
      { score: 80, correct: 8, total: 10 }
    ];
    
    for (let i = 0; i < completedList.length; i++) {
      const schedule = completedList[i];
      // 골고루 분포하여 랜덤 선택
      const opt = scoreOptions[i % scoreOptions.length];
      
      await dbQuery.run(
        "UPDATE schedules SET score = ?, correct_count = ?, total_count = ? WHERE id = ?",
        [opt.score, opt.correct, opt.total, schedule.id]
      );
      console.log(`스케줄 ID ${schedule.id} 성적 업데이트 완료 → 점수: ${opt.score}점 (${opt.correct}/${opt.total} 정답)`);
    }
    
    console.log('모든 과거 완료 스케줄에 성적 데이터가 성공적으로 소급 주입되었습니다! 🚀');
    process.exit(0);
  } catch (err) {
    console.error('과거 성적 주입 에러:', err);
    process.exit(1);
  }
}

run();
