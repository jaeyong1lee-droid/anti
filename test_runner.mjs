import http from 'http';
import { execSync } from 'child_process';
import path from 'path';

function checkUrl(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    }).on('error', (err) => {
      resolve({ error: err.message });
    });
  });
}

function postUrl(url, bodyObj) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(bodyObj);
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });
    req.on('error', (err) => {
      resolve({ error: err.message });
    });
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('       AntiGravity Real-Time Test Runner System     ');
  console.log('====================================================\n');

  let failedCount = 0;

  // [TEST 1] Server File Syntax Checks
  console.log('[TEST 1] Node.js Backend Code Syntax Inspection...');
  const nodeBin = `"${process.execPath}"`;
  try {
    execSync(`${nodeBin} --check server/index.js`, { stdio: 'pipe' });
    execSync(`${nodeBin} --check server/routes/quizRoutes.js`, { stdio: 'pipe' });
    execSync(`${nodeBin} --check server/database.js`, { stdio: 'pipe' });
    console.log('  ➜ [SUCCESS] Server JavaScript files syntax check PASSED (0 syntax errors).');
  } catch (err) {
    failedCount++;
    console.log(`  ➜ [CRITICAL FAIL] Syntax error detected in server code: ${err.message}`);
  }

  // [TEST 2] Frontend Connection Check
  console.log('\n[TEST 2] Frontend Dev Server (http://localhost:3000)...');
  const feRes = await checkUrl('http://localhost:3000');
  if (feRes.statusCode === 200) {
    console.log('  ➜ [SUCCESS] Frontend server active on http://localhost:3000 (Status: 200 OK)');
  } else {
    failedCount++;
    console.log(`  ➜ [CRITICAL FAIL] Frontend server error: ${feRes.error || feRes.statusCode}`);
  }

  // [TEST 3] Backend Direct Connection Check
  console.log('\n[TEST 3] Backend Server Direct (http://localhost:5000)...');
  const beRes = await checkUrl('http://localhost:5000/api/preferred-model');
  if (beRes.statusCode === 200) {
    console.log('  ➜ [SUCCESS] Backend server active on http://localhost:5000 (Status: 200 OK)');
    console.log(`  ➜ [PREFERRED MODEL]: ${beRes.body.trim()}`);
  } else {
    failedCount++;
    console.log(`  ➜ [CRITICAL FAIL] Backend server (Port 5000) connection error: ${beRes.error || beRes.statusCode}`);
    console.log('     Run `node index.js` in server directory to start backend!');
  }

  // [TEST 4] Vite Proxy API Health Check
  console.log('\n[TEST 4] Vite Proxy API Endpoints Suite Check (via Port 3000)...');
  const todayStr = new Date().toISOString().split('T')[0];
  const apiEndpoints = [
    `/api/dashboard?date=${todayStr}`,
    `/api/topics`,
    `/api/lockscreen/pool`,
    `/api/session/mixed-completed`,
    `/api/options/lockscreen_quiz_enabled`
  ];

  for (const ep of apiEndpoints) {
    const res = await checkUrl(`http://localhost:3000${ep}`);
    if (res.statusCode === 200) {
      console.log(`  ➜ [PASS] GET http://localhost:3000${ep} (Status: 200 OK)`);
    } else {
      failedCount++;
      console.log(`  ➜ [FAIL] GET http://localhost:3000${ep} failed (Status: ${res.error || res.statusCode})`);
    }
  }

  // [TEST 5] Save & Load Session Integration Test (GET/POST /api/session/review)
  console.log('\n[TEST 5] Mixed Session Save & Load Integration Test...');
  const testTopicId = `mixed_test_runner_${Date.now()}`;
  const testSessionId = `sess_${testTopicId}`;
  
  const savePayload = {
    topicId: testTopicId,
    sessionId: testSessionId,
    questions: [{ id: 'test_q_1', question: 'Integration Test Question' }],
    tableAnswers: { '0_INPUT': 'Integration Test Answer' },
    tableGradingResults: { '0_INPUT': { isCorrect: true, score: 10, reason: 'Test Reason' } }
  };

  const saveRes = await postUrl('http://localhost:3000/api/session/review', savePayload);
  if (saveRes.statusCode === 200) {
    console.log('  ➜ [PASS] POST /api/session/review (Status: 200 OK)');
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/session/review failed (Status: ${saveRes.error || saveRes.statusCode})`);
  }

  const loadRes = await checkUrl(`http://localhost:3000/api/session/review?topicId=${testTopicId}&sessionId=${testSessionId}`);
  if (loadRes.statusCode === 200) {
    try {
      const data = JSON.parse(loadRes.body);
      if (data.success && data.data && data.data.tableAnswers?.['0_INPUT'] === 'Integration Test Answer') {
        console.log('  ➜ [PASS] GET /api/session/review retrieved saved mixed session data accurately.');
      } else {
        failedCount++;
        console.log('  ➜ [FAIL] GET /api/session/review returned unexpected data structure.');
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] GET /api/session/review returned invalid JSON: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] GET /api/session/review failed (Status: ${loadRes.error || loadRes.statusCode})`);
  }

  // [TEST 6] Quiz Submit String Schedule ID Integration Test
  console.log('\n[TEST 6] Quiz Submit Non-Numeric Schedule ID Test...');
  const submitPayload = {
    topic_id: testTopicId,
    schedule_id: `mixed_schedule_${todayStr}`,
    score: 100,
    isPassed: true,
    questions: [{ id: 'test_q_1' }]
  };
  const submitRes = await postUrl('http://localhost:3000/api/quiz/submit', submitPayload);
  if (submitRes.statusCode === 200) {
    console.log('  ➜ [PASS] POST /api/quiz/submit with string schedule_id handled cleanly (Status: 200 OK).');
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/quiz/submit failed (Status: ${submitRes.error || submitRes.statusCode})`);
  }

  // [TEST 7] REAL Vite Bundle & React Component Compilation Check
  console.log('\n[TEST 7] REAL Vite Bundle & React Component Compilation Check...');
  try {
    const clientPath = path.join(process.cwd(), 'client');
    const viteJsPath = path.join(clientPath, 'node_modules', 'vite', 'bin', 'vite.js');
    execSync(`${nodeBin} "${viteJsPath}" build`, { cwd: clientPath, encoding: 'utf-8', stdio: 'pipe' });
    console.log('  ➜ [SUCCESS] Vite Build PASSED (All React components compiled cleanly).');
  } catch (err) {
    failedCount++;
    console.log('  ➜ [CRITICAL BUILD ERROR]:');
    const stderr = err.stderr || err.stdout || err.message;
    const errorLines = stderr.split('\n').filter(l => l.includes('Error') || l.includes('defined') || l.includes('src/')).slice(0, 10).join('\n     ');
    console.log(`     ${errorLines}`);
  }

  console.log('\n====================================================');
  if (failedCount > 0) {
    console.log(`  ❌ TEST FAILED - ${failedCount} CRITICAL ERRORS DETECTED!`);
    console.log('====================================================');
    process.exit(1);
  } else {
    console.log('  ✅ ALL TESTS PASSED - All Front/Back services 100% operational!');
    console.log('====================================================');
    process.exit(0);
  }
}

runTests();
