import https from 'https';

console.log('=====================================================================');
console.log(' 🤖 ANTIGRAVITY AUTOMATED MASTER REGRESSION TEST SUITE ');
console.log('=====================================================================');

const prodUrl = 'https://anti-ashy.vercel.app';
let passed = 0;
let failed = 0;

function fetchJson(path) {
  return new Promise((resolve) => {
    https.get(`${prodUrl}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve({ status: 200, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: 200, data });
          }
        } else {
          resolve({ status: res.statusCode, data: null });
        }
      });
    }).on('error', (err) => resolve({ status: 500, error: err.message }));
  });
}

async function runTests() {
  console.log('\n[1/4] Testing Production API Endpoints...');
  
  const kstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
  const endpoints = [
    { name: 'Topics List', path: '/api/topics', check: d => Array.isArray(d) && d.length > 0 },
    { name: 'Dashboard Reviews', path: `/api/dashboard?date=${kstDate}`, check: d => d && d.success === true },
    { name: 'Lockscreen Setting', path: '/api/options/lockscreen_quiz_enabled', check: d => d && d.value !== undefined },
    { name: 'Preferred Model Setting', path: '/api/preferred-model', check: d => d && d.model !== undefined },
    { name: 'Question Feedback', path: '/api/question-feedback/all', check: d => d && d.success === true }
  ];

  for (const ep of endpoints) {
    const res = await fetchJson(ep.path);
    if (res.status === 200 && ep.check(res.data)) {
      console.log(`  ✅ [PASS] ${ep.name} (${ep.path})`);
      passed++;
    } else {
      console.log(`  ❌ [FAIL] ${ep.name} (${ep.path}) - Status: ${res.status}`);
      failed++;
    }
  }

  console.log('\n=====================================================================');
  console.log(` 📊 REGRESSION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================================');
}

runTests();
