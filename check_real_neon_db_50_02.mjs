import { dbQuery } from './server/database.js';
import http from 'http';

async function inspectRealDbAndApi() {
  console.log("==========================================");
  console.log("🤖 [자가 개선 테스터 - 실시간 DB & API 정밀 해부]");
  console.log("==========================================");

  try {
    const rows = await dbQuery.all(
      "SELECT key, length(value) as len, substring(value from 1 for 150) as snippet FROM app_session WHERE key LIKE '%50-02%'"
    );
    console.log(`[Neon PostgreSQL DB] Found ${rows.length} session rows matching '%50-02%':`);
    rows.forEach(r => {
      console.log(`  - Key: ${r.key} | Length: ${r.len} | Snippet: ${r.snippet}`);
    });
  } catch (err) {
    console.error("[DB Query Error]:", err.message);
  }

  const getOptions = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/session/review?topicId=50-02',
    method: 'GET'
  };

  http.get(getOptions, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`\n[GET /api/session/review?topicId=50-02] Status: ${res.statusCode}`);
      try {
        const parsed = JSON.parse(data);
        if (parsed.questions && parsed.questions.length > 0) {
          console.log(`  Q1 title: ${parsed.questions[0].title}`);
          console.log(`  Q1 question snippet: ${parsed.questions[0].question?.slice(0, 100)}`);
          console.log(`  Q1 tableData:`, JSON.stringify(parsed.questions[0].tableData));
        } else {
          console.log(`  Response parsed:`, parsed);
        }
      } catch (e) {
        console.log(`  Raw Response:`, data.slice(0, 300));
      }
      console.log("==========================================");
      process.exit(0);
    });
  }).on('error', err => {
    console.error("HTTP Request Error:", err.message);
    process.exit(1);
  });
}

inspectRealDbAndApi();
