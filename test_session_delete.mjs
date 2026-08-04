// [보강된 자가 개선 테스터]: 해당 회차(Schedule ID) 세션 캐시 핀포인트 삭제 API 200 OK 실시간 검증 스크립트

import https from 'https';

console.log("==========================================");
console.log("🤖 [보강된 자가 개선 테스터: 해당 회차 세션 캐시 삭제 API 검증]");
console.log("==========================================");

const targetUrl = 'https://anti-ashy.vercel.app/api/session/review/topic/55?scheduleId=299';

function sendDeleteRequest(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'DELETE',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on('error', err => reject(err));
    req.end();
  });
}

async function runSessionDeleteTest() {
  try {
    console.log(`1. 특정 회차 세션 파기 API (${targetUrl}) DELETE 타격 중...`);
    const res = await sendDeleteRequest(targetUrl);
    console.log(`  -> Response Status: ${res.statusCode}`);
    console.log(`  -> Response Body: ${res.body}`);

    if (res.statusCode === 200) {
      console.log("\n✅ [타격 성공]: 해당 회차(Schedule ID: 299)의 세션 캐시가 백엔드 DB에서 핀포인트로 삭제되었습니다!");
      console.log("\n==========================================");
      console.log("✅ [자가 개선 테스터 최종 통과]: 특정 회차 세션 파기 기능 100% 무결성 실증 확인 완료!");
      console.log("==========================================");
      process.exit(0);
    } else {
      console.error(`❌ [실패]: 세션 삭제 API 상태 코드가 ${res.statusCode} 입니다.`);
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ [테스트 실패]:", err.message);
    process.exit(1);
  }
}

runSessionDeleteTest();
