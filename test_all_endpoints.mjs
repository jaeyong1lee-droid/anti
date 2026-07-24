import https from 'https';

console.log('=====================================================================');
console.log(' 🧪 ANTIGRAVITY PRODUCTION & ENDPOINT SYSTEM TEST RUNNER ');
console.log('=====================================================================');

const prodUrl = 'https://anti-ashy.vercel.app';
const endpoints = [
  '/api/topics',
  '/api/dashboard?date=2026-07-25',
  '/api/options/lockscreen_quiz_enabled',
  '/api/preferred-model',
  '/api/session/tables?t=1784923903889',
  '/api/question-feedback/all'
];

let passed = 0;
let failed = 0;

function fetchEndpoint(path) {
  return new Promise((resolve) => {
    const fullUrl = `${prodUrl}${path}`;
    https.get(fullUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            console.log(`✅ [200 OK] ${path} - Valid JSON (${Array.isArray(parsed) ? parsed.length + ' items' : 'Object'})`);
            passed++;
          } catch (e) {
            console.log(`⚠️ [200 OK] ${path} - Response text received`);
            passed++;
          }
        } else {
          console.log(`❌ [HTTP ${res.statusCode}] ${path}`);
          failed++;
        }
        resolve();
      });
    }).on('error', (err) => {
      console.log(`❌ [ERROR] ${path} - ${err.message}`);
      failed++;
      resolve();
    });
  });
}

async function runAllTests() {
  for (const ep of endpoints) {
    await fetchEndpoint(ep);
  }

  console.log('\n=====================================================================');
  console.log(` 📊 PRODUCTION TEST RESULTS: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================================');
}

runAllTests();
