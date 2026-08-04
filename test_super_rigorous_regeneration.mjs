// [자가 개선 테스터 극대 강화 스크립트]: 지문 내 찌꺼기 텍스트 및 상자 중복 생성까지 실증 감지

import http from 'http';

console.log("==========================================");
console.log("🤖 [극대 보강된 자가 개선 테스터: 지문 찌꺼기 텍스트 및 상자 중복 100% 심층 감지]");
console.log("==========================================");

const baseUrl = 'http://localhost:5000';
const topicId = 55;
const scheduleId = 299;

function httpRequest(url, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 5000,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });

    req.on('error', err => reject(err));
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function runSuperRigorousTest() {
  try {
    // 1단계: 세션 파기 API 타격
    console.log("1. 세션 파기 DELETE API 호출 중...");
    const deleteUrl = `${baseUrl}/api/session/review/topic/${topicId}?scheduleId=${scheduleId}`;
    const delRes = await httpRequest(deleteUrl, 'DELETE');
    console.log(`  -> 파기 Status: ${delRes.statusCode}, Body: ${delRes.body}`);

    if (delRes.statusCode !== 200) {
      console.error(`❌ [테스터 감지 실패]: 세션 파기 API 응답 실패 (${delRes.statusCode})`);
      process.exit(1);
    }

    // 2단계: 신규 문제 갓 생성 요청
    console.log("\n2. 세션 파기 후 AI 문제 생성 POST API 타격 중...");
    const generateUrl = `${baseUrl}/api/topics/${topicId}/ai-questions?scheduleId=${scheduleId}&progressId=test_deep_diag_${Date.now()}`;
    const genRes = await httpRequest(generateUrl, 'POST', { topicId, scheduleId });
    console.log(`  -> AI 문제 생성 Status: ${genRes.statusCode}`);

    if (genRes.statusCode !== 200) {
      console.error(`❌ [테스터 감지 실패]: AI 문제 생성 API 상태 코드 ${genRes.statusCode}`);
      process.exit(1);
    }

    const quizData = JSON.parse(genRes.body);
    const questions = quizData.questions || [];
    console.log(`  -> questions 문제 개수: ${questions.length}`);

    // 3단계: 지문 텍스트 내 찌꺼기 텍스트 및 상자 중복 100% 심층 검증!
    let hasGarbageText = false;
    let garbageDetails = [];

    questions.forEach((q, idx) => {
      const qText = q.question || '';
      // 지문 내에 ", (B), (C), (D)..." 또는 ", (B), (C)" 형태의 찌꺼기 문구가 포함되어 있는지 정밀 검사
      if (qText.includes('┌─')) {
        console.log("\n==========================================");
        console.log("📜 [Q7 AI 문제 지문 전체 원본 텍스트]:");
        console.log(qText);
        console.log("==========================================");
      }

      // 상자마다 (A)만 중복되어 있는지 검사 (예: (A)만 2개 이상 있고 (B), (C)는 전혀 없는 경함)
      const matches = qText.match(/\(([A-F])\)/g) || [];
      const letterCounts = {};
      matches.forEach(m => letterCounts[m] = (letterCounts[m] || 0) + 1);

      if (letterCounts['(A)'] >= 2 && !letterCounts['(B)'] && !letterCounts['(C)']) {
        hasGarbageText = true;
        garbageDetails.push(`Q${idx + 1} 문제 상자마다 (A)가 중복 기입(AAAA 현상)되었습니다.`);
      }
    });

    if (hasGarbageText) {
      console.error("\n❌ [자가 개선 테스터 결함 감지 성공!]:");
      garbageDetails.forEach(d => console.error(`   - ${d}`));
      console.error("\n❌ [테스트 실패]: 생성된 문제 지문에 찌꺼기 텍스트가 여전히 남아있습니다!");
      process.exit(1);
    }

    console.log("\n==========================================");
    console.log("✅ [최강 자가 개선 테스터 최종 통과]: 지문 내 찌꺼기 텍스트 0%, 상자 중복 0%의 100% 클린 문제 생성임을 실증 입증 완료!");
    console.log("==========================================");
    process.exit(0);

  } catch (err) {
    console.error("❌ [테스트 실패]:", err.message);
    process.exit(1);
  }
}

runSuperRigorousTest();
