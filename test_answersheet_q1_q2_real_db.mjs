import http from 'http';

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function testAnswersheetQ1Q2RealDB() {
  console.log('==========================================');
  console.log('🤖 [최첨단 자가 개선 테스터: 복습/답안지 통합 힐러 파이프라인 가상실행 검증]');
  console.log('==========================================');

  // 사용자 실제 브라우저 진입 복습 세션 타격 시나리오!
  const testReviewSessionData = {
    topicId: '50-02',
    sessionId: 'sess_101',
    questions: [
      {
        topic_id: '50-02',
        title: 'Terzaghi 지지력 공식을 활용한 정방형 기초 지지력 산정',
        question: '6. Terzaghi의 전반전단파괴 지지력 공식을 사용하여 아래 그림과 같은 조건의 정방형 기초에 작용하는 허용지지력과 허용하중을 각각에 대하여 구하시오.',
        category: '계산',
        tableData: {
          headers: ['구분', '내용'],
          rows: [['주관식 서술 및 답안', '[INPUT_0_1]']]
        }
      },
      {
        topic_id: '50-02',
        title: 'Terzaghi 지지력 공식과 Meyerhof 지지력 공식 비교',
        question: 'Terzaghi 지지력 공식과 Meyerhof 지지력 공식의 정방형 기초 적용 시 주요 특징 및 차이점을 비교하는 다음 표의 빈칸에 알맞은 공학적 내용을 서술하시오.',
        category: '일반',
        tableData: {
          headers: ['구분', '내용'],
          rows: [['주관식 서술 및 답안', '[INPUT_0_1]']]
        }
      }
    ]
  };

  try {
    console.log('1. DB 복습 세션 공간에 오염된 데이터 POST 타격 중...');
    const postRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/session/review',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, testReviewSessionData);
    console.log(`  -> Review POST 응답 상태: ${postRes.status}`);

    console.log('\n2. DB 복습 세션 공간에서 healQuizQuestionObject 힐러를 거쳐 GET 파싱 수신 중...');
    const getRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/session/review?topicId=50-02&sessionId=sess_101',
      method: 'GET'
    });

    const sessionData = getRes.data?.data;
    const questions = sessionData?.questions || [];
    console.log(`  -> 복습 파이프라인에서 수신된 총 문항 수: ${questions.length}개\n`);

    const q1 = questions[0];
    console.log('📜 [복습 파이프라인 수신 Q1 (Terzaghi 계산) 치유 후 표채우기 구조]:');
    console.log('  - Headers:', JSON.stringify(q1?.tableData?.headers));
    console.log('  - Rows:');
    (q1?.tableData?.rows || []).forEach(r => console.log('    ', JSON.stringify(r)));

    const q2 = questions[1];
    console.log('\n📜 [복습 파이프라인 수신 Q2 (Meyerhof 비교) 치유 후 표채우기 구조]:');
    console.log('  - Headers:', JSON.stringify(q2?.tableData?.headers));
    console.log('  - Rows:');
    (q2?.tableData?.rows || []).forEach(r => console.log('    ', JSON.stringify(r)));

    const isQ1Healed = q1?.tableData?.rows?.length === 2 && q1?.tableData?.rows[0][0].includes('허용지지력');
    const isQ2Healed = q2?.tableData?.headers?.length === 3 && q2?.tableData?.headers[2].includes('Meyerhof');

    if (isQ1Healed && isQ2Healed) {
      console.log('\n==========================================');
      console.log('✅ [복습/답안지 파이프라인 자가 개선 검증 100% 성공]: 사용자 실제 진입 경로에서 Q1 2행 구분 및 Q2 3열 타공법 비교표가 100% 완벽히 표출됩니다!');
      console.log('==========================================');
      process.exit(0);
    } else {
      console.error('\n❌ [복습/답안지 파이프라인 검증 실패]: 힐러 미작동!');
      process.exit(1);
    }
  } catch (err) {
    console.error('테스트 실행 에러:', err);
    process.exit(1);
  }
}

testAnswersheetQ1Q2RealDB();
