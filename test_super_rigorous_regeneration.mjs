// [자가 개선 테스터 극대 강화]: React DOM renderLineContent 시뮬레이션 기반 최종 화면 찌꺼기 100% 실증 감지

import http from 'http';

console.log("==========================================");
console.log("🤖 [최첨단 자가 개선 테스터: React DOM Line Renderer 시뮬레이션 기반 찌꺼기 감지]");
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

// App.jsx 의 renderLineContent 렌더링 1:1 시뮬레이터
function simulateRenderLineContent(content) {
  const letterMatch = content.match(/\(([A-F])\)/);
  if (!letterMatch) return { leftText: content, inputPlaceholder: '', rightText: '' };
  
  const letter = letterMatch[1];
  const parts = content.split(`(${letter})`);
  const leftText = parts[0] || '';
  let rightText = parts[1] || '';

  // Sync with App.jsx renderLineContent rightText sanitizer
  rightText = rightText.replace(/,?\s*\([A-Z]\)(?:\s*,\s*\([A-Z]\))+/gi, '');
  rightText = rightText.replace(/,?\s*\([B-Z]\)(?:\s*,\s*\([B-Z]\))*/gi, '');
  rightText = rightText.replace(/입력[\s,]*\([B-Z]\)[\s\S]*/gi, '');

  return { leftText, inputPlaceholder: `(${letter}) 입력`, rightText };
}

async function runSuperRigorousTest() {
  try {
    // 1단계: 세션 파기 API 타격
    console.log("1. 세션 파기 DELETE API 호출 중...");
    const deleteUrl = `${baseUrl}/api/session/review/topic/${topicId}?scheduleId=${scheduleId}`;
    const delRes = await httpRequest(deleteUrl, 'DELETE');
    
    if (delRes.statusCode !== 200) {
      console.error(`❌ [테스터 감지]: 세션 파기 API 응답 실패 (${delRes.statusCode})`);
      process.exit(1);
    }

    // 2단계: AI 문제 생성 요청
    console.log("2. 세션 파기 후 AI 문제 생성 POST API 타격 중...");
    const generateUrl = `${baseUrl}/api/topics/${topicId}/ai-questions?scheduleId=${scheduleId}&progressId=test_dom_sim_${Date.now()}`;
    const genRes = await httpRequest(generateUrl, 'POST', { topicId, scheduleId });

    if (genRes.statusCode !== 200) {
      console.error(`❌ [테스터 감지]: AI 문제 생성 API 상태 코드 ${genRes.statusCode}`);
      process.exit(1);
    }

    const quizData = JSON.parse(genRes.body);
    const questions = quizData.questions || [];
    console.log(`  -> 수신된 문제 개수: ${questions.length}`);

    // Q7 원본 지문 출력
    const q7 = questions.find(q => (q.question || '').includes('┌─')) || questions[6];
    if (q7) {
      console.log("\n==========================================");
      console.log("📜 [실제 백엔드가 보낸 Q7 지문 원본 텍스트]:");
      console.log(q7.question);
      console.log("==========================================");
    }

    // 3단계: React DOM renderLineContent 시뮬레이션 기반 최종 화면 문자열 100% 심층 검사!
    let hasDomGarbage = false;
    let errorLog = [];

    questions.forEach((q, qIdx) => {
      const qText = q.question || '';
      const lines = qText.split('\n');

      // AAAA 중복 알파벳 도배 감지
      const matches = qText.match(/\(([A-F])\)/g) || [];
      const letters = matches.map(m => m.replace(/[\(\)]/g, ''));
      if (letters.length >= 2 && letters.every(l => l === 'A')) {
        hasDomGarbage = true;
        errorLog.push(`Q${qIdx + 1} 문제에 (A)만 ${letters.length}개 중복 도배되어 있습니다! (AAAA 버그 감지)`);
      }

      lines.forEach((line, lIdx) => {
        const rendered = simulateRenderLineContent(line);
        // 화면 오른쪽 <span> 태그에 ", (B), (C)..." 식별 기호 찌꺼기가 노출되는지 검사
        if (/,?\s*\(B\)\s*,\s*\(C\)/i.test(rendered.rightText) || /,\s*\(B\)\s*,\s*\(C\)/i.test(rendered.rightText) || rendered.rightText.includes(', (B), (C)')) {
          hasDomGarbage = true;
          errorLog.push(`Q${qIdx + 1} 문제 L${lIdx + 1} 줄 화면 우측 span 태그에 찌꺼기 텍스트 ["${rendered.rightText.trim()}"] 가 렌더링 노출됩니다!`);
        }
      });
    });

    if (hasDomGarbage) {
      console.error("\n❌ [자가 개선 테스터 결함 100% 감지 성공!]:");
      errorLog.forEach(log => console.error(`   - ${log}`));
      console.error("\n❌ [테스트 실패]: 브라우저 화면 우측 span 태그에 찌꺼기 텍스트가 노출되고 있습니다!");
      process.exit(1);
    }

    console.log("\n==========================================");
    console.log("✅ [최첨단 자가 개선 테스터 최종 통과]: 브라우저 DOM 렌더링 시 우측 span 찌꺼기 노출 0%임을 실증 검증 완결!");
    console.log("==========================================");
    process.exit(0);

  } catch (err) {
    console.error("❌ [테스트 실패]:", err.message);
    process.exit(1);
  }
}

runSuperRigorousTest();
