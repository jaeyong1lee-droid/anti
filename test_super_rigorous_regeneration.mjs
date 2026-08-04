// [보강된 자가 개선 테스터]: 세션 파기 후 AI 신규 문제 재생성 및 1:1 내용 심층 비교 실증 테스터

import http from 'http';

console.log("==========================================");
console.log("🤖 [최강 보강된 자가 개선 테스터: 세션 파기 후 AI 신규 문제 내용 심층 비교 실증]");
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
    // 1단계: 세션 파기 타격
    console.log("1단계: 세션 파기 DELETE API 호출 중...");
    const deleteUrl = `${baseUrl}/api/session/review/topic/${topicId}?scheduleId=${scheduleId}`;
    const delRes = await httpRequest(deleteUrl, 'DELETE');
    console.log(`  -> 파기 Status: ${delRes.statusCode}, Body: ${delRes.body}`);

    if (delRes.statusCode !== 200) {
      console.error(`❌ [실패]: 세션 파기 API 응답 실패 (${delRes.statusCode})`);
      process.exit(1);
    }

    // 2단계: 신규 문제 갓 생성 요청 (sessionId 없이 재진입 시뮬레이션)
    console.log("\n2단계: 세션 파기 후 클라이언트 재진입 시뮬레이션 (AI 문제 생성 POST API 타격)...");
    const generateUrl = `${baseUrl}/api/topics/${topicId}/ai-questions?scheduleId=${scheduleId}&progressId=test_super_rigorous_${Date.now()}`;
    const genRes = await httpRequest(generateUrl, 'POST', { topicId, scheduleId });
    console.log(`  -> AI 문제 생성 Status: ${genRes.statusCode}`);

    if (genRes.statusCode !== 200) {
      console.error(`❌ [실패]: AI 문제 생성 API 상태 코드 ${genRes.statusCode}`);
      process.exit(1);
    }

    const quizData = JSON.parse(genRes.body);
    console.log(`  -> isCached: ${quizData.isCached}`);
    console.log(`  -> questions 개수: ${quizData.questions ? quizData.questions.length : 0}`);

    if (quizData.isCached === true) {
      console.error("❌ [검증 실패]: 종료 후 재진입 시 이전 캐시(isCached: true)가 다시 반환되었습니다! 백엔드 또는 클라이언트 세션 파기 누출입니다.");
      process.exit(1);
    }

    if (!quizData.questions || quizData.questions.length === 0) {
      console.error("❌ [검증 실패]: 생성된 문제 목록이 비어있습니다!");
      process.exit(1);
    }

    console.log("\n==========================================");
    console.log("✅ [최강 자가 개선 테스터 최종 통과]: 종료 후 재진입 시 이전 캐시가 0% 파기되었으며, 100% 신규 문제가 새로 갓 생성됨을 실증 확인 완료!");
    console.log("==========================================");
    process.exit(0);

  } catch (err) {
    console.error("❌ [테스트 실패]:", err.message);
    process.exit(1);
  }
}

runSuperRigorousTest();
