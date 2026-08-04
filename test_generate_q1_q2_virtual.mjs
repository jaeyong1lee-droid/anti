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

async function testGenerateQ1Q2Virtual() {
  console.log('==========================================');
  console.log('🤖 [최첨단 자가 개선 테스터: Q1, Q2 가상공간 생성 및 실타격 렌더링 검증]');
  console.log('==========================================');

  // 1번 계산 문제 & 2번 타공법 비교 문제 가상 출제 세션 데이터
  const sessionPayload = {
    topicId: '50-02',
    sessionId: 'virtual_q1_q2_test',
    questions: [
      {
        topic_id: '50-02',
        title: 'Terzaghi 전반전단파괴 지지력 및 허용하중 산정 (Q1)',
        question: '6. Terzaghi의 전반전단파괴 지지력 공식을 사용하여 아래 그림과 같은 조건의 정방형 기초에 작용하는 허용지지력과 허용하중을 각각에 대하여 구하시오.\n\n| 구분 | 내용 |\n| --- | --- |\n| 1. 허용지지력 ($q_a$) | [INPUT_1] |\n| 2. 허용하중 ($P_a$) | [INPUT_2] |',
        category: '계산',
        tableData: {
          headers: ['구분', '내용'],
          rows: [
            ['1. 허용지지력 ($q_a$)', '[INPUT_1]'],
            ['2. 허용하중 ($P_a$)', '[INPUT_2]']
          ]
        }
      },
      {
        topic_id: '50-02',
        title: 'Terzaghi 지지력 공식과 Meyerhof 지지력 공식 비교 (Q2)',
        question: 'Terzaghi 지지력 공식과 Meyerhof 지지력 공식의 정방형 기초 적용 시 주요 특징 및 차이점을 비교하는 다음 표의 빈칸에 알맞은 공학적 내용을 서술하시오.\n\n| 비교 항목 | Terzaghi 지지력 공식 | Meyerhof 지지력 공식 |\n| --- | --- | --- |\n| 하중 경사 및 편심 고려 | 수직/중심 하중 전제 (미반영) | [INPUT_1] |\n| 근입 깊이($D_f$) 전단저항 | 기초 상부 흙 중량만 반영 ($q=\\gamma D_f$) | [INPUT_2] |',
        category: '일반',
        tableData: {
          headers: ['비교 항목', 'Terzaghi 지지력 공식', 'Meyerhof 지지력 공식'],
          rows: [
            ['하중 경사 및 편심 고려', '수직/중심 하중 전제 (미반영)', '[INPUT_1]'],
            ['근입 깊이($D_f$) 전단저항', '기초 상부 흙 중량만 반영 ($q=\\gamma D_f$)', '[INPUT_2]']
          ]
        }
      }
    ]
  };

  try {
    console.log('1. 가상공간 백엔드 DB 세션에 Q1, Q2 생성 데이터 POST 타격 중...');
    const postRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/session/review',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, sessionPayload);
    console.log(`  -> POST 세션 생성 응답: ${postRes.status} OK`);

    console.log('\n2. 가상공간 백엔드 DB 세션에서 GET 실타격 및 수신 파싱 렌더링 검증 중...');
    const getRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/session/review?topicId=50-02&sessionId=virtual_q1_q2_test',
      method: 'GET'
    });

    const questions = getRes.data?.data?.questions || [];
    console.log(`  -> 가상공간에서 반환된 문제 수: ${questions.length}개\n`);

    const q1 = questions[0];
    console.log('📌 [가상공간 수신 Q1 (Terzaghi 계산 문제) 표 구조]:');
    console.log('  - Title:', q1?.title);
    console.log('  - Table Headers:', JSON.stringify(q1?.tableData?.headers));
    console.log('  - Table Rows:');
    (q1?.tableData?.rows || []).forEach(r => console.log('    ', JSON.stringify(r)));

    const q2 = questions[1];
    console.log('\n📌 [가상공간 수신 Q2 (Meyerhof 비교 문제) 표 구조]:');
    console.log('  - Title:', q2?.title);
    console.log('  - Table Headers:', JSON.stringify(q2?.tableData?.headers));
    console.log('  - Table Rows:');
    (q2?.tableData?.rows || []).forEach(r => console.log('    ', JSON.stringify(r)));

    // 검증: Q1에 Meyerhof 3열 비교표가 덮어씌워졌는지 여부 체킹!
    const isQ1Correct = q1?.tableData?.headers?.length === 2 && q1?.tableData?.rows[0][0].includes('허용지지력');
    const isQ2Correct = q2?.tableData?.headers?.length === 3 && q2?.tableData?.headers[2].includes('Meyerhof');

    if (isQ1Correct && isQ2Correct) {
      console.log('\n==========================================');
      console.log('✅ [가상공간 생성 실증 100% 성공]: Q1은 허용지지력/허용하중 2행 표로, Q2는 Meyerhof 3열 비교표로 각자의 독립된 순정 표가 100% 정상 출제되어 노출됩니다!');
      console.log('==========================================');
      process.exit(0);
    } else {
      console.error('\n❌ [가상공간 생성 검증 실패]: 덮어쓰기 오염 여전히 존재!');
      process.exit(1);
    }
  } catch (err) {
    console.error('테스트 실행 에러:', err);
    process.exit(1);
  }
}

testGenerateQ1Q2Virtual();
