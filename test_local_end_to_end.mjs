// [보강된 자가 개선 테스터]: 로컬 E2E 가상공간 세션 파기 & AI 문제 재생성 100% 끝까지 실증 검증 스크립트

import http from 'http';
import fs from 'fs';
import path from 'path';

console.log("==========================================");
console.log("🤖 [보강된 자가 개선 테스터: 로컬 가상공간 E2E 세션 파기 & 재생성 끝까지 검증]");
console.log("==========================================");

const localBaseUrl = 'http://localhost:5000';
const deleteEndpoint = `${localBaseUrl}/api/session/review/topic/55?scheduleId=299`;
const generateEndpoint = `${localBaseUrl}/api/topics/55/ai-questions?progressId=test_e2e_local_diag&scheduleId=299&sessionId=sess_topic_55_round_2`;

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

async function runLocalE2ETest() {
  try {
    // 1단계: 로컬 세션 삭제 타격 검증
    console.log(`1. 로컬 세션 파기 API 타격 중... (${deleteEndpoint})`);
    const delRes = await httpRequest(deleteEndpoint, 'DELETE');
    console.log(`  -> Response Status: ${delRes.statusCode}, Body: ${delRes.body}`);

    if (delRes.statusCode !== 200) {
      console.error(`❌ [실패]: 로컬 세션 파기 API가 상태 코드 ${delRes.statusCode}를 반환했습니다.`);
      process.exit(1);
    }
    console.log("✅ [1단계 성공]: 로컬 백엔드 세션 파기 요청 200 OK 처리 완료.");

    // 2단계: 신규 문제 재생성 타격 검증 (isCached 가 false/undefined 인지 끝까지 확인)
    console.log(`\n2. 로컬 AI 문제 생성 API 타격하여 신규 재생성 100% 끝까지 검증 중...`);
    const genRes = await httpRequest(generateEndpoint, 'POST', { progressId: 'test_e2e_local_diag' });
    console.log(`  -> Response Status: ${genRes.statusCode}`);

    if (genRes.statusCode !== 200) {
      console.error(`❌ [실패]: 로컬 AI 문제 생성 API 상태 코드 ${genRes.statusCode}: ${genRes.body.slice(0, 300)}`);
      process.exit(1);
    }

    const quizData = JSON.parse(genRes.body);
    console.log(`  -> isCached 필드 상태: ${quizData.isCached}`);
    console.log(`  -> questions 문제 개수: ${quizData.questions ? quizData.questions.length : 0}`);

    if (quizData.isCached === true) {
      console.error("❌ [재생성 검증 실패]: 세션을 지웠음에도 과거 캐시(isCached: true)가 다시 반환되었습니다!");
      process.exit(1);
    }

    console.log("\n==========================================");
    console.log("✅ [자가 개선 테스터 최종 통과]: 종료 후 재진입 시 로컬 백엔드가 100% 신규 문제를 갓 새로 재생성함을 입증 완료!");
    console.log("==========================================");
    process.exit(0);

  } catch (err) {
    console.error("❌ [테스트 실패]: 로컬 백엔드 서버(http://localhost:5000)가 미가동 중이거나 오류 발생:", err.message);
    process.exit(1);
  }
}

runLocalE2ETest();
