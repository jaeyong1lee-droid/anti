import http from 'http';

function checkEndpoint(path) {
  return new Promise((resolve) => {
    http.get(`http://localhost:5000${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[GET ${path}] Status: ${res.statusCode}`);
        if (res.statusCode >= 400) {
          console.log(`  -> Response Error Snippet: ${data.slice(0, 300)}`);
        } else {
          console.log(`  -> OK! Length: ${data.length}`);
        }
        resolve(res.statusCode);
      });
    }).on('error', (err) => {
      console.error(`[GET ${path}] Request Error:`, err.message);
      resolve(500);
    });
  });
}

async function runCheck() {
  console.log("==========================================");
  console.log("🤖 [자가 개선 테스터 - 백엔드 API 전수 조사]");
  console.log("==========================================");
  await checkEndpoint('/api/topics');
  await checkEndpoint('/api/topics/40/ai-questions?progressId=test_p1&scheduleId=292&sessionId=sess_topic_40_round_3');
  await checkEndpoint('/api/session/review?topicId=40');
  console.log("==========================================");
}

runCheck();
