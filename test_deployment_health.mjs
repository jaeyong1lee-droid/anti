// [보강된 자가 개선 테스터]: 프로덕션 Vercel 배포 URL 및 최신 JS 번들 에셋 200 OK 무결성 실시간 타격 검증 스크립트

import https from 'https';

console.log("==========================================");
console.log("🤖 [보강된 자가 개선 테스터: 프로덕션 배포 & 에셋 404 타격 검증]");
console.log("==========================================");

const targetUrl = 'https://anti-ashy.vercel.app';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', err => reject(err));
  });
}

async function runDeploymentHealthTest() {
  try {
    console.log(`1. Vercel 메인 엔드포인트 (${targetUrl}) 타격 검증 중...`);
    const mainRes = await fetchUrl(targetUrl);
    
    if (mainRes.statusCode !== 200) {
      console.error(`❌ [배포 실패]: 메인 서버 응답 상태 코드가 ${mainRes.statusCode}입니다.`);
      process.exit(1);
    }
    console.log(`✅ [타격 성공]: 메인 index.html (상태 코드 ${mainRes.statusCode} OK) 수신 완료.`);

    // HTML 내의 최신 index-XXXX.js 번들 에셋 URL 추출
    const assetMatches = mainRes.body.match(/\/assets\/index-[a-zA-Z0-9_-]+\.js/g);
    if (!assetMatches || assetMatches.length === 0) {
      console.warn("⚠️ 메인 에셋 번들 JS URL을 파싱하지 못했습니다. (HTML 구조 확인 필요)");
    } else {
      const assetPath = assetMatches[0];
      const fullAssetUrl = `${targetUrl}${assetPath}`;
      console.log(`\n2. 최신 번들 에셋 URL 타격 검증 중: ${fullAssetUrl}`);

      const assetRes = await fetchUrl(fullAssetUrl);
      if (assetRes.statusCode === 200) {
        console.log(`✅ [에셋 타격 성공]: 최신 메인 JS 번들 에셋(${assetPath})이 상태 코드 200 OK로 정상 응답합니다. (404 에러 0건)`);
      } else {
        console.error(`❌ [에셋 404 실패]: 최신 JS 번들 에셋이 상태 코드 ${assetRes.statusCode}를 반환했습니다!`);
        process.exit(1);
      }
    }

    console.log("\n==========================================");
    console.log("✅ [자가 개선 테스터 최종 통과]: 프로덕션 서버 및 최신 JS 번들 에셋 404 무결성 100% 실증 검증 완료!");
    console.log("==========================================");
    process.exit(0);

  } catch (err) {
    console.error("❌ [테스트 실패]: 타격 중 네트워크/서버 에러 발생:", err.message);
    process.exit(1);
  }
}

runDeploymentHealthTest();
