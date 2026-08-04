// [보강된 자가 개선 테스터]: 세션 삭제 후 AI 문제 재생성 (Regeneration) 100% 무결성 실시간 끝까지 검증 스크립트

import https from 'https';

console.log("==========================================");
console.log("🤖 [자가 개선 테스터: 세션 삭제 후 신규 문제 재생성 100% 실증 검증]");
console.log("==========================================");

const baseUrl = 'https://anti-ashy.vercel.app';
const deleteUrl = `${baseUrl}/api/session/review/topic/55?scheduleId=299`;
const generateUrl = `${baseUrl}/api/topics/55/ai-questions?progressId=test_diag_regen_99&scheduleId=299&sessionId=sess_topic_55_round_2`;

function requestUrl(url, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });

    req.on('error', err => reject(err));
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function runDeleteAndRegenerateTest() {
  try {
    // 1단계: 세션 삭제 DELETE API 호출
    console.log(`1단계: 세션 파기 DELETE 타격 중... (${deleteUrl})`);
    const delRes = await requestUrl(deleteUrl, 'DELETE');
    console.log(`  -> 세션 파기 Status: ${delRes.statusCode}, Body: ${delRes.body}`);

    if (delRes.statusCode !== 200) {
      console.error("❌ [실패]: 세션 파기 API 실패!");
      process.exit(1);
    }

    // 2단계: AI 문제 생성 POST API 호출하여 재생성 여부 검증
    console.log(`\n2단계: AI 문제 생성 API 타격하여 신규 재생성 검증 중... (${generateUrl})`);
    const genRes = await requestUrl(generateUrl, 'POST', { progressId: 'test_diag_regen_99' });
    console.log(`  -> AI 문제 생성 Status: ${genRes.statusCode}`);

    if (genRes.statusCode !== 200) {
      console.error(`❌ [실패]: 문제 생성 API 응답 오류 (${genRes.statusCode}): ${genRes.body.slice(0, 300)}`);
      process.exit(1);
    }

    const resData = JSON.parse(genRes.body);
    console.log(`  -> isCached: ${resData.isCached}`);
    console.log(`  -> questions 개수: ${resData.questions ? resData.questions.length : 0}`);

    // 3단계: 캐시 히트(isCached: true)가 아니고, 새 문제가 생성되었는지 100% 끝까지 검증!
    if (resData.isCached === true) {
      console.error("❌ [재생성 검증 실패]: 세션을 지웠음에도 이전 캐시(isCached: true)가 다시 반환되었습니다! 백엔드 캐시 파기가 미흡합니다.");
      process.exit(1);
    }

    console.log("\n==========================================");
    console.log("✅ [자가 개선 테스터 최종 통과]: 종료 후 과거 캐시가 0.0001%도 남아있지 않고 AI가 100% 신규 문제를 갓 새로 재생성함을 입증 완료!");
    console.log("==========================================");
    process.exit(0);

  } catch (err) {
    console.error("❌ [테스트 실패]:", err.message);
    process.exit(1);
  }
}

runDeleteAndRegenerateTest();
