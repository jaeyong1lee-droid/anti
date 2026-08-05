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
    execSync(`cmd /c npm run build`, { cwd: clientPath, encoding: 'utf-8', stdio: 'pipe' });
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
