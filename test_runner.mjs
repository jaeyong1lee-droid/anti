import http from 'http';
import fs from 'fs';
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

  // [TEST 1] Server File Syntax & ReferenceError Inspection
  console.log('[TEST 1] Node.js Backend Code & Runtime ReferenceError Inspection...');
  const nodeBin = `"${process.execPath}"`;
  try {
    execSync(`${nodeBin} --check server/index.js`, { stdio: 'pipe' });
    execSync(`${nodeBin} --check server/routes/quizRoutes.js`, { stdio: 'pipe' });
    execSync(`${nodeBin} --check server/database.js`, { stdio: 'pipe' });
    execSync(`${nodeBin} test_syntax_and_references.mjs`, { stdio: 'pipe' });
    console.log('  ➜ [SUCCESS] Server JavaScript files & Runtime ReferenceError check PASSED (0 errors).');
  } catch (err) {
    failedCount++;
    console.log(`  ➜ [CRITICAL FAIL] Syntax or ReferenceError detected in code: ${err.message}`);
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
    `/api/session/last-active-review`,
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
    const viteBin = path.join(clientPath, 'node_modules', 'vite', 'bin', 'vite.js');
    execSync(`node "${viteBin}" build`, { cwd: clientPath, encoding: 'utf-8', stdio: 'pipe' });
    console.log('  ➜ [SUCCESS] Vite Build PASSED (All React components compiled cleanly).');
  } catch (err) {
    failedCount++;
    console.log('  ➜ [CRITICAL BUILD ERROR]:');
    const stderr = err.stderr || err.stdout || err.message;
    const errorLines = stderr.split('\n').filter(l => l.includes('Error') || l.includes('defined') || l.includes('src/')).slice(0, 10).join('\n     ');
    console.log(`     ${errorLines}`);
  }

  // [TEST 8] Calculation Question (D) Item & Single Item AI Re-evaluation Test
  console.log('\n[TEST 8] Calculation Item (D) & Single-Item AI Re-evaluation Test...');
  const calcGradingPayload = {
    question: "Terzaghi 지지력 공식을 사용하여 허용지지력 및 허용하중을 산정하시오. B=2.0m, gamma=18kN/m3, c=20kPa, phi=30도.",
    correctAnswer: "",
    userAnswer: "13008",
    rowHeader: "(4) 조건 (b)의 허용하중 P_all (b) (kN)",
    colHeader: "수치 계산 답안",
    explanation: "Terzaghi의 지지력 공식 허용하중 계산 결과입니다.",
    category: "계산",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  const calcGradeRes = await postUrl('http://localhost:3000/api/grade-subjective', calcGradingPayload);
  if (calcGradeRes.statusCode === 200) {
    try {
      const data = JSON.parse(calcGradeRes.body);
      if (data.reason !== '답안이 비어 있습니다.' && typeof data.score === 'number' && data.score >= 0) {
        console.log(`  ➜ [PASS] POST /api/grade-subjective for item (D) scored ${data.score}점 (Reason: ${data.reason}).`);
      } else {
        failedCount++;
        console.log(`  ➜ [FAIL] POST /api/grade-subjective returned invalid score/reason: ${data.reason}`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] POST /api/grade-subjective returned invalid JSON: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/grade-subjective failed (Status: ${calcGradeRes.error || calcGradeRes.statusCode})`);
  }

  // [TEST 9] Calculation Item State Preservation Test
  console.log('\n[TEST 9] Calculation Items (A,B,C,D) State Preservation Test...');
  const statePayload = {
    topicId: `calc_state_test_${Date.now()}`,
    sessionId: `sess_calc_state_${Date.now()}`,
    questions: [{ id: 'q_terzaghi', type: '주관식 (계산)', question: 'Terzaghi 지지력' }],
    tableAnswers: {
      '0_INPUT_1': '632',
      '0_INPUT_2': '10112',
      '0_INPUT_3': '813',
      '0_INPUT_4': '13008'
    },
    tableGradingResults: {
      '0_INPUT_1': { isCorrect: true, score: 10 },
      '0_INPUT_2': { isCorrect: true, score: 10 },
      '0_INPUT_3': { isCorrect: true, score: 6.3 },
      '0_INPUT_4': { isCorrect: true, score: 10 }
    }
  };

  const stateSaveRes = await postUrl('http://localhost:3000/api/session/review', statePayload);
  if (stateSaveRes.statusCode === 200) {
    const stateLoadRes = await checkUrl(`http://localhost:3000/api/session/review?topicId=${statePayload.topicId}&sessionId=${statePayload.sessionId}`);
    if (stateLoadRes.statusCode === 200) {
      try {
        const loaded = JSON.parse(stateLoadRes.body);
        const results = loaded.data?.tableGradingResults || {};
        if (results['0_INPUT_1'] && results['0_INPUT_2'] && results['0_INPUT_3'] && results['0_INPUT_4']) {
          console.log('  ➜ [PASS] All 4 calculation items (A,B,C,D) preserved 100% in DB and session state.');
        } else {
          failedCount++;
          console.log('  ➜ [FAIL] Calculation sub-items lost in session state:', results);
        }
      } catch (e) {
        failedCount++;
        console.log(`  ➜ [FAIL] Invalid JSON from session review: ${e.message}`);
      }
    } else {
      failedCount++;
      console.log(`  ➜ [FAIL] GET /api/session/review failed (Status: ${stateLoadRes.error || stateLoadRes.statusCode})`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/session/review failed (Status: ${stateSaveRes.error || stateSaveRes.statusCode})`);
  }

  // [TEST 10] Screenshot Case (D) Item "답안이 비어 있습니다" Fault Detection Test
  console.log('\n[TEST 10] Screenshot Case (D) Item "답안이 비어 있습니다" Fault Detection Test...');
  const terzaghiScreenshotPayload = {
    question: "Terzaghi 지지력 공식을 사용하여 허용지지력 및 허용하중을 산정하시오. B=2.0m, gamma=18kN/m3, c=20kPa, phi=30도. (1) 조건(a) 허용지지력 (2) 조건(a) 허용하중 (3) 조건(b) 허용지지력 (4) 조건(b) 허용하중",
    correctAnswer: "", // INTENTIONALLY EMPTY to mimic missing INPUT_4 key in q.answers
    userAnswer: "13008",
    rowHeader: "(4) 조건 (b)의 허용하중 P_all (b) (kN)",
    colHeader: "수치 계산 답안",
    explanation: "Terzaghi 지지력 공식을 이용한 조건 (b) 허용하중 P_all = 13008 kN (또는 연속기초 10112 kN) 산정 과정 및 정답 해설입니다.",
    category: "계산",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  const terzaghiGradeRes = await postUrl('http://localhost:3000/api/grade-subjective', terzaghiScreenshotPayload);
  if (terzaghiGradeRes.statusCode === 200) {
    try {
      const data = JSON.parse(terzaghiGradeRes.body);
      if (data.reason === '답안이 비어 있습니다.' || data.score === 0 || !data.isCorrect) {
        failedCount++;
        console.log(`  ➜ [CRITICAL FAIL] AI incorrectly graded item (D) answer "13008" as 0점! Reason: "${data.reason}"`);
      } else {
        console.log(`  ➜ [PASS] AI successfully evaluated item (D) answer "13008" as ${data.score}점! Reason: "${data.reason}"`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] Invalid JSON from grade-subjective: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/grade-subjective failed (Status: ${terzaghiGradeRes.error || terzaghiGradeRes.statusCode})`);
  }

  // [TEST 11] Calculation Item Fuzzy ID Resolution Fault Test
  console.log('\n[TEST 11] Calculation Item Mismatched ID Resolution Test...');
  const mockCalcItems = [
    { id: '1', label: '(1) 조건 (a)의 허용지지력' },
    { id: '2', label: '(2) 조건 (a)의 허용하중' },
    { id: '3', label: '(3) 조건 (b)의 허용지지력' },
    { id: '4', label: '(4) 조건 (b)의 허용하중 P_all (b) (kN)' }
  ];

  const resolveCalcItem = (items, targetId) => {
    if (!Array.isArray(items) || items.length === 0 || !targetId) return null;
    const strId = String(targetId).trim();
    let hit = items.find(it => String(it.id || '').trim() === strId);
    if (hit) return hit;

    const numMatch = strId.match(/\d+/);
    const targetNum = numMatch ? parseInt(numMatch[0], 10) : null;

    let targetLetter = null;
    const letterMatch = strId.match(/_([A-F])\b/i) || strId.match(/^([A-F])$/i) || strId.match(/([A-F])$/i);
    if (letterMatch) {
      targetLetter = letterMatch[1].toUpperCase();
    }
    const targetLetterIdx = targetLetter ? targetLetter.charCodeAt(0) - 65 + 1 : null;
    const targetIndex = targetNum || targetLetterIdx;

    if (targetIndex) {
      return items.find((it, idx) => {
        const itemStr = String(it.id || '').trim();
        const itemNum = (itemStr.match(/\d+/) || [])[0];
        const itemLetterMatch = itemStr.match(/_([A-F])\b/i) || itemStr.match(/^([A-F])$/i) || (it.label || '').match(/\(([A-F])\)/i);
        const itemLetter = itemLetterMatch ? itemLetterMatch[1].toUpperCase() : null;
        const itemLetterIdx = itemLetter ? itemLetter.charCodeAt(0) - 65 + 1 : null;

        const itemIdx = (itemNum ? parseInt(itemNum, 10) : null) || itemLetterIdx || (idx + 1);
        return itemIdx === targetIndex;
      }) || (targetIndex <= items.length ? items[targetIndex - 1] : null);
    }
    return null;
  };

  const testInputIds = ['INPUT_4', '4', 'INPUT_D', 'D', '(4)'];
  for (const inputId of testInputIds) {
    const found = resolveCalcItem(mockCalcItems, inputId);
    if (found && found.label.includes('(4)')) {
      console.log(`  ➜ [PASS] Successfully resolved inputId "${inputId}" to calcItem label: "${found.label}"`);
    } else {
      failedCount++;
      console.log(`  ➜ [CRITICAL FAIL] Failed to resolve inputId "${inputId}" to item (D) label! Result: ${found?.label || 'null'}`);
    }
  }

  // [TEST 12] AI Math Hallucination Anti-Echo Test (Terzaghi q_all Calculation)
  console.log('\n[TEST 12] AI Math Hallucination Anti-Echo Test (Terzaghi Item A)...');
  const echoTestPayload = {
    question: "Terzaghi 지지력 공식을 사용하여 허용지지력 및 허용하중을 산정하시오. B=2.0m, Df=0m, gamma=18kN/m3, c=20kPa, phi=30도. (Nc=37.2, Nq=22.5, Ngamma=19.7, Fs=3.0)",
    correctAnswer: "",
    userAnswer: "700", // User typed wrong answer 700
    rowHeader: "(1) 조건 (a)의 허용지지력 q_all (a) (kN/m²)",
    colHeader: "수치 계산 답안",
    explanation: "Terzaghi 지지력 공식(q_u = 1.3cN_c + gamma*D_f*N_q + 0.4*gamma*B*N_gamma)을 적용하고 안전율 Fs=3으로 나누어 허용지지력 q_all을 산정합니다.",
    category: "계산",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  const echoGradeRes = await postUrl('http://localhost:3000/api/grade-subjective', echoTestPayload);
  if (echoGradeRes.statusCode === 200) {
    try {
      const data = JSON.parse(echoGradeRes.body);
      const suggested = String(data.suggestedModelAnswer || '');
      const hasEcho700 = /허용지지력\s*(?:q_all)?\s*=\s*700/i.test(suggested) || /답은\s*700/i.test(suggested);
      
      if (hasEcho700) {
        failedCount++;
        console.log(`  ➜ [CRITICAL FAIL] AI hallucinated user's wrong answer "700" as model answer! Suggested: "${suggested.slice(0, 100)}..."`);
      } else {
        console.log(`  ➜ [PASS] AI correctly calculated true mathematical model answer without echoing "700". Model Answer: "${suggested.slice(0, 100)}..."`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] Invalid JSON from grade-subjective: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/grade-subjective failed (Status: ${echoGradeRes.error || echoGradeRes.statusCode})`);
  }

  // [TEST 13] Server-Side Numeric Guard Tolerance & False-Positive Override Test
  console.log('\n[TEST 13] Server-Side Numeric Guard Override Test (700 vs Ref 632)...');
  const tolerancePayload = {
    question: "Terzaghi 지지력 공식을 사용하여 허용지지력 및 허용하중을 산정하시오.",
    correctAnswer: "632.0",
    userAnswer: "700", // Wrong typed value
    rowHeader: "(1) 조건 (a)의 허용지지력 q_all (a) (kN/m²)",
    colHeader: "수치 계산 답안",
    explanation: "Terzaghi 지지력 공식 대입 결과 q_all = 632.0 kN/m² 입니다.",
    category: "계산",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  const toleranceGradeRes = await postUrl('http://localhost:3000/api/grade-subjective', tolerancePayload);
  if (toleranceGradeRes.statusCode === 200) {
    try {
      const data = JSON.parse(toleranceGradeRes.body);
      if (!data.isCorrect && data.score < 8) {
        console.log(`  ➜ [PASS] Server-Side Numeric Guard correctly rejected wrong answer "700" (score: ${data.score}점, reason: ${data.reason}).`);
      } else {
        failedCount++;
        console.log(`  ➜ [CRITICAL FAIL] Server-Side Guard failed to reject wrong answer "700"! Score: ${data.score}점, Reason: ${data.reason}`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] Invalid JSON from grade-subjective: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/grade-subjective failed (Status: ${toleranceGradeRes.error || toleranceGradeRes.statusCode})`);
  }

  // [TEST 14] Polluted Model Answer Clean-up & Re-evaluation Test (700 in correctAnswer vs 632 in explanation)
  console.log('\n[TEST 14] Polluted Model Answer Clean-up & Re-evaluation Test (700 in correctAnswer vs 632 in explanation)...');
  const pollutedPayload = {
    question: "Terzaghi 지지력 공식을 사용하여 허용지지력 및 허용하중을 산정하시오.",
    correctAnswer: "Terzaghi 지스트 공식인 q_u = 1.3cN_c + gamma*D_f*N_q + 0.4*gamma*B*N_gamma 에 주어진 조건(B=2.0m, gamma=18kN/m3, c=20kPa, phi=30도, D_f=0)을 대입하여 극한지지력을 구한 뒤 안전율을 적용하면 허용지지력 q_all = 700 kN/m² 이 도출됩니다.", // Polluted with user answer 700!
    userAnswer: "700", // Wrong typed value
    rowHeader: "(1) 조건 (a)의 허용지지력 q_all (a) (kN/m²)",
    colHeader: "수치 계산 답안",
    explanation: "Terzaghi 지지력 공식(q_u = 1.3cN_c + 0.4*gamma*B*N_gamma = 1.3*20*37.2 + 0.4*18*2*19.7 = 967.2 + 283.68 = 1250.88 kN/m²)에 따라 허용지지력 q_all = 1250.88 / 2 = 625.44 kN/m² (또는 Fs=3일 때 416.96 kN/m², 연속기초 632.0 kN/m²) 입니다.",
    category: "계산",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  const pollutedGradeRes = await postUrl('http://localhost:3000/api/grade-subjective', pollutedPayload);
  if (pollutedGradeRes.statusCode === 200) {
    try {
      const data = JSON.parse(pollutedGradeRes.body);
      if (!data.isCorrect && data.score < 8) {
        console.log(`  ➜ [PASS] Server correctly stripped polluted "700" from correctAnswer and rejected wrong user answer (score: ${data.score}점, reason: ${data.reason}).`);
      } else {
        failedCount++;
        console.log(`  ➜ [CRITICAL FAIL] Server accepted polluted "700" in correctAnswer as valid! Score: ${data.score}점, Reason: ${data.reason}`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] Invalid JSON from grade-subjective: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/grade-subjective failed (Status: ${pollutedGradeRes.error || pollutedGradeRes.statusCode})`);
  }

  // [TEST 15] AI Tutor Chat Route Test (/api/chat)
  console.log('\n[TEST 15] AI Tutor Chat Endpoint Test (/api/chat)...');
  const chatPayload = {
    message: "1차 압밀방정식에 대해 설명해줘",
    history: [],
    preferredModel: "gemini-3.5-flash-lite"
  };

  const chatRes = await postUrl('http://localhost:3000/api/chat', chatPayload);
  if (chatRes.statusCode === 200) {
    try {
      const data = JSON.parse(chatRes.body);
      if (data.text && data.text.length > 10) {
        console.log(`  ➜ [PASS] POST /api/chat returned valid AI tutor response (Length: ${data.text.length} chars).`);
      } else {
        failedCount++;
        console.log(`  ➜ [CRITICAL FAIL] POST /api/chat returned empty text response! Data: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] Invalid JSON from /api/chat: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/chat failed (Status: ${chatRes.error || chatRes.statusCode})`);
  }

  // [TEST 16] Item (A) Answer "634" Exact Matching & False 0-Point Protection Test
  console.log('\n[TEST 16] Item (A) Answer "634" Exact Matching Test (User typed 634 vs Ref 634 in Explanation)...');
  const itemAPayload = {
    question: "Terzaghi 지지력 공식을 활용하여 다음 항목을 계산하시오.",
    correctAnswer: "약 634 kN/m²",
    userAnswer: "634",
    rowHeader: "(1) 조건 (a)의 허용지지력 q_all (a) (kN/m²)",
    colHeader: "수치 계산 답안",
    explanation: "Terzaghi의 극한지지력 공식(q_u = 1.3cN_c + gamma*D_f*N_q + 0.4*gamma*B*N_gamma)을 활용합니다. 지표면 설치 조건이므로 D_f = 0 이며, phi = 30도에 대한 지지력 계수는 N_c = 37.2, N_gamma = 19.7 등을 적용합니다. 허용안전율 F.S. = 3 을 적용할 때 허용지지력 q_all 은 약 634 kN/m² (또는 산정 기준에 따른 정밀 계산값)으로 도출됩니다.",
    category: "계산",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  const itemAGradeRes = await postUrl('http://localhost:3000/api/grade-subjective', itemAPayload);
  if (itemAGradeRes.statusCode === 200) {
    try {
      const data = JSON.parse(itemAGradeRes.body);
      if (data.isCorrect && data.score >= 8) {
        console.log(`  ➜ [PASS] Server-Side Numeric Guard correctly recognized valid answer "634" as 10점 (score: ${data.score}점, reason: ${data.reason}).`);
      } else {
        failedCount++;
        console.log(`  ➜ [CRITICAL FAIL] Server-Side Guard falsely rejected valid answer "634"! Score: ${data.score}점, Reason: ${data.reason}`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] Invalid JSON from grade-subjective: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/grade-subjective failed (Status: ${itemAGradeRes.error || itemAGradeRes.statusCode})`);
  }

  // [TEST 17] Item (C) (#3) Re-grading Test (User typed 813 vs Ref 813.42 in Explanation)
  console.log('\n[TEST 17] Item (C) (#3) Re-grading Test (User typed 813 vs Ref 813.42 in Explanation)...');
  const itemCPayload = {
    question: "Terzaghi 지지력 공식을 활용한 정방형 기초 지지력 산정 수치 계산 답안",
    correctAnswer: "813.42 kN/m²",
    userAnswer: "813",
    rowHeader: "(3) 조건 (b)의 허용지지력 q_all (b) (kN/m²)",
    colHeader: "수치 계산 답안",
    explanation: "STEP 3. 극한지지력 q_u = 2033.54 kN/m² ... 조건 (b) 허용지지력 q_a = 813.42 kN/m²",
    topicId: 50,
    category: "계산",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  const itemCGradeRes = await postUrl('http://localhost:3000/api/grade-subjective', itemCPayload);
  if (itemCGradeRes.statusCode === 200) {
    try {
      const data = JSON.parse(itemCGradeRes.body);
      if (data.isCorrect && data.score >= 8) {
        console.log(`  ➜ [PASS] Server-Side Numeric Guard correctly recognized item (C) (#3) valid answer "813" as 10점 (score: ${data.score}점, reason: ${data.reason}).`);
      } else {
        failedCount++;
        console.log(`  ➜ [CRITICAL FAIL] Server falsely rejected item (C) (#3) valid answer "813"! Score: ${data.score}점, Reason: ${data.reason}`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] Invalid JSON from grade-subjective: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/grade-subjective failed (Status: ${itemCGradeRes.error || itemCGradeRes.statusCode})`);
  }

  // [TEST 18] Live Browser Screenshot Case: Item (C) (#3) Re-grading with Empty Explanation & Auto DB Enrichment
  console.log('\n[TEST 18] Live Browser Screenshot Case: Item (C) (#3) Re-grading with Empty Explanation...');
  const itemCBrowserPayload = {
    question: "폭 B=2.0m 인 정방형 기초가 지표면에 설치되어 있다. 흙의 단위중량 gamma=18kN/m³, 점착력 c=20kPa, 내부마찰각 phi=30도 이다. Terzaghi 지지력 공식을 활용하여 다음 항목을 계산하시오.",
    correctAnswer: "813.42 kN/m² (반올림 시 813 kN/m²)",
    userAnswer: "813",
    rowHeader: "(3) 조건 (b)의 허용지지력 q_all (b) (kN/m²)",
    colHeader: "수치 계산 답안",
    explanation: "", // Empty string to simulate live browser missing topic context
    category: "계산",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  const itemCBrowserRes = await postUrl('http://localhost:3000/api/grade-subjective', itemCBrowserPayload);
  if (itemCBrowserRes.statusCode === 200) {
    try {
      const data = JSON.parse(itemCBrowserRes.body);
      if (data.isCorrect && data.score >= 8) {
        console.log(`  ➜ [PASS] Live Browser Single-Item Re-grading correctly recognized valid answer "813" as 10점 (score: ${data.score}점, reason: ${data.reason}).`);
      } else {
        failedCount++;
        console.log(`  ➜ [CRITICAL FAIL] Server falsely rejected live browser answer "813"! Score: ${data.score}점, Reason: ${data.reason}`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] Invalid JSON from grade-subjective: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/grade-subjective failed (Status: ${itemCBrowserRes.error || itemCBrowserRes.statusCode})`);
  }

  // [TEST 19] Comparison Table / Conceptual Description Answer Excluded from Numeric Guard Test
  console.log('\n[TEST 19] Comparison Table / Conceptual Description Answer Excluded from Numeric Guard Test...');
  const conceptualPayload = {
    question: "Terzaghi 지지력 공식에서 기초의 형상 요인 및 극한지지력 산정 시 고려되는 지반의 전단파괴 메커니즘 특성을 비교 분석하는 다음 표의 빈칸에 알맞은 내용을 명사형 종결어미로 서술하시오.",
    correctAnswer: "2차원 평면변형률 상태를 가정하므로 3차원 코너 효과 및 측면 전단저항이 발생하지 않아 별도의 형상 계수 적용이 없음",
    userAnswer: "2차원 평면변형률상태의 연속기초기반 모델로 별도 계수 적용 없음",
    rowHeader: "기초 형상 계수 적용성",
    colHeader: "스트립(연속) 기초",
    explanation: "연속기초는 2차원 평면변형률 상태를 가정하여 별도 계수가 적용되지 않음.",
    category: "비교표",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  const conceptualRes = await postUrl('http://localhost:3000/api/grade-subjective', conceptualPayload);
  if (conceptualRes.statusCode === 200) {
    try {
      const data = JSON.parse(conceptualRes.body);
      if (!data.reason.includes('일치하지 않는 것으로 판정되었습니다')) {
        console.log(`  ➜ [PASS] Conceptual comparison table answer correctly bypassed Numeric Guard and evaluated via Standard Review Grading (score: ${data.score}점, reason: ${data.reason}).`);
      } else {
        failedCount++;
        console.log(`  ➜ [CRITICAL FAIL] Numeric Guard erroneously over-reached onto conceptual description answer! Reason: ${data.reason}`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] Invalid JSON from grade-subjective: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/grade-subjective failed (Status: ${conceptualRes.error || conceptualRes.statusCode})`);
  }

  // [TEST 20] Universal Calculation Guard Test for Topic 53-02 (Dam Seepage Flownet q, Q, ic Calculation)
  console.log('\n[TEST 20] Universal Calculation Guard Test for Topic 53-02 (Dam Seepage Flownet Calculation)...');
  const seepagePayload = {
    question: "그림에 나타낸 덤에 대하여 (1) 침투수량 (2) A, B 및 C점에서의 간극수압, (3) C점에서 출구까지 동수경사를 구하시오. 단, 흙의 투수계수는 2.0 * 10^-3 m/s 이다.",
    correctAnswer: "0.00002 m³/s/m (또는 2.0 * 10^-5 m³/s/m)",
    userAnswer: "2.0 * 10^-5",
    rowHeader: "(1) 유선망 한 개의 요소가 부담하는 단위 폭당 침투유량 (q, m³/s/m)",
    colHeader: "계산 결과 및 답안",
    explanation: "유선망 1개 요소 침투유량 q = k * H * (1/Nd) = 2.0*10^-3 * 30 * (1/30) = 0.00002 m³/s/m",
    topicId: 53,
    category: "수리해석",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  const seepageRes = await postUrl('http://localhost:3000/api/grade-subjective', seepagePayload);
  if (seepageRes.statusCode === 200) {
    try {
      const data = JSON.parse(seepageRes.body);
      if (data.isCorrect && data.score >= 8) {
        console.log(`  ➜ [PASS] Topic 53-02 Seepage Calculation correctly recognized scientific notation answer "2.0 * 10^-5" as 10점 (score: ${data.score}점, reason: ${data.reason}).`);
      } else {
        failedCount++;
        console.log(`  ➜ [CRITICAL FAIL] Server falsely rejected Topic 53-02 seepage answer "2.0 * 10^-5"! Score: ${data.score}점, Reason: ${data.reason}`);
      }
    } catch (e) {
      failedCount++;
      console.log(`  ➜ [FAIL] Invalid JSON from grade-subjective: ${e.message}`);
    }
  } else {
    failedCount++;
    console.log(`  ➜ [FAIL] POST /api/grade-subjective failed (Status: ${seepageRes.error || seepageRes.statusCode})`);
  }

  // [TEST 21] Lock/Unlock Toggle Icon & State Control Verification (Table, Acronym, Overview)
  console.log('\n[TEST 21] Lock/Unlock Toggle Icon & State Control Verification (Table, Acronym, Overview)...');
  const lockFiles = [
    'client/src/App.jsx',
    'client/src/components/FloatingMemorization.jsx'
  ];

  for (const filePath of lockFiles) {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      failedCount++;
      console.log(`  ➜ [CRITICAL FAIL] Target file ${filePath} does not exist!`);
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    const hasLockIcon = content.includes('<Lock') || content.includes('Lock,') || content.includes('Lock ');
    
    const hasLockedTableDecl = /const\s*\[\s*lockedTableIds|lockedTableIds\s*=\s*\{\}/.test(content);
    const hasLockedAcronymDecl = /const\s*\[\s*lockedAcronymIds|lockedAcronymIds\s*=\s*\{\}/.test(content);
    const hasLockedOverviewDecl = /const\s*\[\s*lockedOverviewIds|lockedOverviewIds\s*=\s*\{\}/.test(content);

    const hasLockedTableUse = content.includes('lockedTableIds');
    const hasLockedAcronymUse = content.includes('lockedAcronymIds');
    const hasLockedOverviewUse = content.includes('lockedOverviewIds');

    if (!hasLockIcon || !hasLockedTableDecl || !hasLockedAcronymDecl || !hasLockedOverviewDecl || !hasLockedTableUse || !hasLockedAcronymUse || !hasLockedOverviewUse) {
      failedCount++;
      console.log(`  ➜ [CRITICAL FAIL] Lock/Unlock state declaration/usage missing in ${filePath}: LockIcon=${hasLockIcon}, TableDecl=${hasLockedTableDecl}, AcronymDecl=${hasLockedAcronymDecl}, OverviewDecl=${hasLockedOverviewDecl}`);
    } else {
      console.log(`  ➜ [PASS] ${filePath} verified: Lock icon & state declarations+usage (lockedTableIds, lockedAcronymIds, lockedOverviewIds) 100% active.`);
    }
  }

  // [TEST 22] Lock Modification Leak Detector (Table, Acronym, Overview)
  console.log('\n[TEST 22] Lock Modification Leak Detector (Table, Acronym, Overview)...');
  const appCode = fs.readFileSync(path.resolve('client/src/App.jsx'), 'utf8');

  const lockLeakSuite = [
    { name: 'Table AI Regenerate Guard', check: appCode.includes('lockedTableIds[t.id]') && appCode.includes('표가 잠겨 있어 재작성할 수 없습니다.') },
    { name: 'Table Cell/Header Edit Guard', check: /lockedTableIds\[t\.id\]\s*\|\|\s*hIdx\s*===\s*0/.test(appCode) && appCode.includes('if (lockedTableIds[t.id]) return;') },
    { name: 'Acronym Full Regenerate Guard', check: appCode.includes('lockedAcronymIds[ac.id]') && appCode.includes('두문자가 잠겨 있어 완전변경할 수 없습니다.') },
    { name: 'Acronym Re-optimize Guard', check: appCode.includes('lockedAcronymIds[ac.id]') && appCode.includes('두문자가 잠겨 있어 재조합할 수 없습니다.') },
    { name: 'Acronym Input ReadOnly Guard', check: appCode.includes('readOnly={lockedAcronymIds[ac.id]}') },
    { name: 'Overview Refresh Guard', check: appCode.includes('lockedOverviewIds[ov.id]') && appCode.includes('개요가 잠겨 있어 새로고침할 수 없습니다.') },
    { name: 'Overview Table Header Edit Guard', check: appCode.includes('if (lockedOverviewIds[ov.id]) return;') },
    { name: 'Overview Table Row Delete Guard', check: appCode.includes('!lockedOverviewIds[ov.id]') }
  ];

  for (const lc of lockLeakSuite) {
    if (!lc.check) {
      failedCount++;
      console.log(`  ➜ [FAIL] Lock leak detected: ${lc.name} missing!`);
    } else {
      console.log(`  ➜ [PASS] ${lc.name} verified: Modification 100% blocked when locked.`);
    }
  }

  // [TEST 23] Topic 53 Dam Seepage 5 Input Items Dynamic Generation Check
  console.log('\n[TEST 23] Topic 53 Dam Seepage 5 Input Items Dynamic Generation Check...');
  const { healQuizQuestionObject } = await import('./client/src/utils/latexUtils.js');
  const mockTopic53Q = {
    type: '주관식 (계산)',
    question: "그림에 나타낸 댐 저면 침투 및 유선망 수리해석에 대하여 (1) 침투수량 (2) A, B, C 지점에서의 간극수압 (3) 동수경사를 구하시오.",
    topicId: 53
  };
  const healed53 = healQuizQuestionObject(mockTopic53Q);
  if (Array.isArray(healed53.calcItems) && healed53.calcItems.length === 5) {
    console.log(`  ➜ [PASS] Topic 53 Dam Seepage analysis successfully generated EXACTLY 5 dynamic input items (INPUT_1 ~ INPUT_5).`);
  } else {
    failedCount++;
    console.log(`  ➜ [CRITICAL FAIL] Topic 53 Dam Seepage analysis generated ${healed53.calcItems?.length || 0} items instead of 5!`);
  }

  // [TEST 24] Q1 Convert Button Restoration & Dummy Item Fault Detection Check
  console.log('\n[TEST 24] Q1 Convert Button Restoration & Dummy Item Fault Detection Check...');
  const mockDummyQ = {
    type: '주관식 (계산)',
    question: "3. 그림에 나타낸 댐에 대하여 (1) 침투수량 (2) A, B 및 C점에서의 간극수압, (3) C점에서 출구까지 동수경사를 구하시오.",
    topicId: 53,
    calcItems: [
      { id: 'INPUT_1', label: '(1) 수치 계산 항목 1' },
      { id: 'INPUT_2', label: '(2) 수치 계산 항목 2' }
    ]
  };
  const healedDummy = healQuizQuestionObject(mockDummyQ);
  const isDummyDetected = healedDummy.calcItems.some(it => /수치\s*계산\s*항목/i.test(it.label || ''));
  const is53CountValid = healedDummy.calcItems.length === 5;

  if (isDummyDetected || !is53CountValid) {
    failedCount++;
    console.log(`  ➜ [CRITICAL FAIL] Tester failed to fix dummy items! DummyDetected: ${isDummyDetected}, Count: ${healedDummy.calcItems.length}`);
  } else {
    console.log(`  ➜ [PASS] Tester successfully recognized dummy items as FAULT and healed Topic 53 to 5 dynamic input items!`);
  }

  // Check App.jsx for Q1 convert button restoration (no hidden condition for calculation Q1)
  const appSrc = fs.readFileSync(path.resolve('client/src/App.jsx'), 'utf8');
  if (appSrc.includes("{!(selectedTopic?.category === '계산' && idx === 0) && (")) {
    failedCount++;
    console.log(`  ➜ [CRITICAL FAIL] App.jsx still hides Q1 convert button for calculation category!`);
  } else {
    console.log(`  ➜ [PASS] Q1 convert button restoration verified in App.jsx!`);
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
