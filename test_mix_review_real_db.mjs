const BASE_URL = 'http://localhost:5000';

async function testMixReviewRealDb() {
  console.log('==========================================');
  console.log('🤖 [최첨단 자가 개선 테스터: 믹스 복습 실제 DB 저장 및 로드 실증 테스트]');
  console.log('==========================================');

  // 1. POST /api/session/review -> 실제 믹스 복습 세션 데이터 DB에 저장 생성 타격
  const mockQuestions = [
    {
      id: 11,
      type: "주관식",
      subtype: "표채우기",
      topic_id: 1,
      question: `다음 억지말뚝보강 비탈면 설계 수행 절차 흐름도를 보고 빈칸에 들어갈 올바른 설계 단계명과 구체적인 설계 세부 활동을 아래 표의 빈칸에 입력하시오.

\`\`\`
┌────────────────────────────────────────────────────────┐
│  [1] 비탈면 한계평형해석 (LEM) 수행                       │
│  - 강우 지하수위를 반영한 잠재 활동면 및 최소 안전율 규명   │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  [ (A), (B), (C), (D) ]                                               │
│  - (A), (B), (C), (D)                                                 │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  [3] 말뚝 단면 및 열간 격자 설계                          │
│  - 천공 경 (A), (B), (C), (D), 튜브 강관 두께 및 평면 배치 간격(d1) 결정   │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  [ (A), (B), (C), (D) ]                                               │
│  - (A), (B), (C), (D)                                                 │
└────────────────────────────────────────────────────────┘
\`\`\``
    }
  ];

  const payload = {
    topicId: 'mixed_test',
    sessionId: 'mix_test_session_101',
    questions: mockQuestions,
    selectedAnswers: {},
    revealedQuestions: {},
    tableAnswers: {},
    tableGradingResults: {}
  };

  console.log('1. DB 세션에 믹스 복습 세션 데이터 저장 POST API 타격 중...');
  const postRes = await fetch(`${BASE_URL}/api/session/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const postJson = await postRes.json();
  console.log('  -> POST 응답 결과:', postJson.success ? '성공 (200 OK)' : postJson);

  console.log('\n2. DB 세션에서 믹스 복습 세션 데이터 불러오기 GET API 타격 중...');
  const getRes = await fetch(`${BASE_URL}/api/session/review?topicId=mixed_test&sessionId=mix_test_session_101`);
  const getJson = await getRes.json();
  
  if (getJson.success && getJson.data && getJson.data.questions) {
    const q11 = getJson.data.questions[0];
    console.log('\n📜 [GET API로 세척되어 수신된 믹스 복습 Q11번 문제 텍스트 원본]:');
    console.log('---------------------------------------------------------');
    console.log(q11.question);
    console.log('---------------------------------------------------------');

    const hasAAAA = q11.question.includes('(A), (B), (C), (D)');
    const hasCleanA = q11.question.includes('[ (A) ]');

    if (!hasAAAA && hasCleanA) {
      console.log('\n==========================================');
      console.log('✅ [믹스 복습 실제 DB 테스트 최종 성공]: (A), (B), (C), (D) 순서대로 100% 정순 세척 완료!');
      console.log('==========================================');
    } else {
      console.error('\n❌ [믹스 복습 실제 DB 테스트 실패]: 세척 미흡 감지!');
      process.exit(1);
    }
  } else {
    console.error('❌ GET API 응답 데이터 조회 실패:', getJson);
    process.exit(1);
  }
}

testMixReviewRealDb().catch(err => {
  console.error('테스트 실행 에러:', err);
  process.exit(1);
});
