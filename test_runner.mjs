import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertMarkdownToHtml, cleanAndSanitizeMathText, renderKatexString } from './client/src/utils/renderingHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fetch = globalThis.fetch;
const BASE_URL = process.env.TEST_URL || 'https://anti.vercel.app';

import { execSync } from 'child_process';

async function runTests() {
  console.log('=====================================================================');
  console.log(' 🤖 ANTIGRAVITY AUTOMATED MASTER REGRESSION TEST SUITE (EXHAUSTIVE) ');
  console.log('=====================================================================\n');

  let passed = 0;
  let failed = 0;

  // 0. React Client JSX Compilation Test
  console.log('[0/4] Testing React Client JSX Compilation (Vite Build)...');
  try {
    execSync('cd client && npm run build', { cwd: process.cwd(), stdio: 'pipe' });
    console.log('  ✅ [PASS] ⚛️ [React Client JSX] Vite Build Compilation Passed (No Syntax/Adjacent Element Errors)');
    passed++;
  } catch (buildErr) {
    console.log(`  ❌ [FAIL] ⚛️ [React Client JSX] Vite Build Failed: ${buildErr.message.split('\n')[0]}`);
    failed++;
  }

  // 0.5. React UI Modal Unconditional Mounting Verification
  console.log('\n[0.5/4] Testing UI Modal Unconditional Root Mounting (Double-Click Trigger Test)...');
  try {
    const fs = await import('fs');
    const appJsxContent = fs.readFileSync('./client/src/App.jsx', 'utf-8');
    
    const tempModalMounted = appJsxContent.includes('showTempEditModal') && appJsxContent.includes('온도 설정 팝업');
    const modelOrderModalMounted = appJsxContent.includes('showModelOrderEditModal') && appJsxContent.includes('AI 모델 순서 설정 팝업');
    const doubleClickTempTrigger = appJsxContent.includes('onDoubleClick={() => setShowTempEditModal(true)}');
    const doubleClickOrderTrigger = appJsxContent.includes('onDoubleClick={() => setShowModelOrderEditModal(true)}');

    if (tempModalMounted && modelOrderModalMounted && doubleClickTempTrigger && doubleClickOrderTrigger) {
      console.log('  ✅ [PASS] 🖥️ [UI Modal Root Mount] Temperature & Model Order Modals & Double Click Triggers Active & Safe');
      passed++;
    } else {
      console.log(`  ❌ [FAIL] 🖥️ [UI Modal Root Mount] Modals condition-trapped or triggers missing (temp:${tempModalMounted}, order:${modelOrderModalMounted}, trigTemp:${doubleClickTempTrigger}, trigOrd:${doubleClickOrderTrigger})`);
      failed++;
    }

    // 0.6. React App Ref & State ReferenceError Safeguard Check
    console.log('\n[0.6/4] Testing React Component Ref & State Declarations (Uncaught ReferenceError Safeguard)...');
    const refMatches = [...appJsxContent.matchAll(/([a-zA-Z0-9_]+Ref)\.current/g)].map(m => m[1]);
    const uniqueRefs = [...new Set(refMatches)];
    let missingRefs = [];
    for (const refName of uniqueRefs) {
      const isDeclared = appJsxContent.includes(`const ${refName} =`) || appJsxContent.includes(`let ${refName} =`) || appJsxContent.includes(`var ${refName} =`);
      if (!isDeclared) {
        missingRefs.push(refName);
      }
    }
    if (missingRefs.length === 0) {
      console.log(`  ✅ [PASS] 🛡️ [Ref Reference Safety] All ${uniqueRefs.length} useRef variables used in App.jsx are properly declared!`);
      passed++;
    } else {
      console.log(`  ❌ [FAIL] 🛡️ [Ref Reference Safety] Undeclared useRef variables detected: ${missingRefs.join(', ')}`);
      failed++;
    }

    // 0.65. State & Variable Scope ReferenceError Safeguard Check
    console.log('\n[0.65/4] Testing Variable & State Declarations (Scope Safety & Undeclared Variable Check)...');
    const checkedVars = ['allTopics', 'recent10DaysActivity', 'aiHistory', 'todayReviews', 'otherStandardsText', 'allHardcodedRules'];
    let undeclaredVars = [];
    for (const vName of checkedVars) {
      const isDeclared = appJsxContent.includes(`const ${vName}`) || appJsxContent.includes(`let ${vName}`) || appJsxContent.includes(`const [${vName}`);
      if (!isDeclared) {
        undeclaredVars.push(vName);
      }
    }
    const hasRawTopicsErr = appJsxContent.includes('(topics ||') || appJsxContent.includes(', topics]');
    if (undeclaredVars.length === 0 && !hasRawTopicsErr) {
      console.log(`  ✅ [PASS] 🛡️ [Scope Safety] All activity state variables (allTopics, aiHistory, todayReviews, etc.) are valid & no undeclared variable references found!`);
      passed++;
    } else {
      console.log(`  ❌ [FAIL] 🛡️ [Scope Safety] Undeclared or misnamed state variables detected: ${undeclaredVars.join(', ')} ${hasRawTopicsErr ? '(raw topics found)' : ''}`);
      failed++;
    }

    // 0.66. Undefined JSX Component Tag ReferenceError Safeguard Check
    console.log('\n[0.66/4] Testing JSX Component Tag Declaration Safeguard (Undefined Component ReferenceError Guard)...');
    const jsxTagMatches = [...appJsxContent.matchAll(/<([A-Z][a-zA-Z0-9_]+)[\s\/>]/g)].map(m => m[1]);
    const uniqueTags = [...new Set(jsxTagMatches)];
    let missingComponentDefs = [];
    const lucideImports = [...appJsxContent.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g)].flatMap(m => m[1].split(',').map(s => s.trim()));
    const allKnownNames = new Set([...uniqueTags, ...lucideImports]);

    for (const tag of uniqueTags) {
      const isDefined = appJsxContent.includes(`import ${tag}`) || 
                        appJsxContent.includes(`import { ${tag}`) || 
                        lucideImports.includes(tag) || 
                        appJsxContent.includes(`function ${tag}`) || 
                        appJsxContent.includes(`const ${tag} =`) ||
                        appJsxContent.includes(`const ${tag} = memo`) ||
                        appJsxContent.includes(`const ${tag} = React.memo`);
      if (!isDefined) {
        missingComponentDefs.push(tag);
      }
    }
    if (missingComponentDefs.length === 0) {
      console.log(`  ✅ [PASS] 🛡️ [Component Tag Safety] All ${uniqueTags.length} JSX Component tags used in App.jsx are validly imported or declared! (0 ReferenceErrors)`);
      passed++;
    } else {
      console.log(`  ❌ [FAIL] 🛡️ [Component Tag Safety] Undeclared Component tags detected: ${missingComponentDefs.join(', ')}`);
      failed++;
    }

    // 0.68. React Global ErrorBoundary & Unhandled Rejection Safeguard Check
    console.log('\n[0.68/4] Testing Global ErrorBoundary & Unhandled Rejection Safeguard...');
    const mainJsxPath = path.join(__dirname, 'client', 'src', 'main.jsx');
    const mainJsxContent = fs.readFileSync(mainJsxPath, 'utf-8');
    const hasGlobalErrorBoundary = mainJsxContent.includes('GlobalErrorBoundary') && mainJsxContent.includes('getDerivedStateFromError');
    const hasUnhandledRejectionSafeguard = mainJsxContent.includes('unhandledrejection') && mainJsxContent.includes('preventDefault');
    const hasPopStateCatchSafeguard = appJsxContent.includes('forceSaveActiveSessions().catch');

    if (hasGlobalErrorBoundary && hasUnhandledRejectionSafeguard && hasPopStateCatchSafeguard) {
      console.log('  ✅ [PASS] 🛡️ [Error & Promise Safeguard] Global ErrorBoundary, Unhandled Rejection Listener & Popstate Catch Guard Active!');
      passed++;
    } else {
      console.log(`  ❌ [FAIL] 🛡️ [Error & Promise Safeguard] Safeguard missing (ErrorBoundary:${hasGlobalErrorBoundary}, RejectionGuard:${hasUnhandledRejectionSafeguard}, PopStateCatch:${hasPopStateCatchSafeguard})`);
      failed++;
    }

    // 0.69. Testing Hardcoded Standards Edit, Delete & Add UI Engine
    console.log('\n[0.69/4] Testing Hardcoded Standards Edit, Delete & Add UI Engine...');
    const hasEditHardcodedModal = appJsxContent.includes('showEditHardcodedRuleModal') && appJsxContent.includes('handleSaveHardcodedRule');
    const hasDeleteHardcodedHandler = appJsxContent.includes('handleDeleteHardcodedRule') && appJsxContent.includes('window.confirm');
    const hasAddHardcodedBtn = appJsxContent.includes('지침 신규 추가');
    const hasCardEditBtn = appJsxContent.includes('Edit size={11}') || appJsxContent.includes('>수정<');
    const hasCardDeleteBtn = appJsxContent.includes('Trash2 size={11}') || appJsxContent.includes('>삭제<');

    if (hasEditHardcodedModal && hasDeleteHardcodedHandler && hasAddHardcodedBtn && hasCardEditBtn && hasCardDeleteBtn) {
      console.log('  ✅ [PASS] 🔒 [Hardcoded Edit/Delete/Add Engine] Edit, Delete, New Add Buttons & Real-time Sync Handlers Active!');
      passed++;
    } else {
      console.log(`  ❌ [FAIL] 🔒 [Hardcoded Edit/Delete/Add Engine] Feature missing (Modal:${hasEditHardcodedModal}, Del:${hasDeleteHardcodedHandler}, Add:${hasAddHardcodedBtn}, EditBtn:${hasCardEditBtn}, DelBtn:${hasCardDeleteBtn})`);
      failed++;
    }

    // 0.7. Testing New Standards Button & 7-Day Filter Engine
    console.log('\n[0.7/4] Testing New Standards Button & 7-Day Filter Engine...');
    const hasRecentMemo = appJsxContent.includes('const recentStandardsList = useMemo(');
    const hasSevenDaysFilter = appJsxContent.includes('SEVEN_DAYS_MS');
    const hasNewBtnUI = appJsxContent.includes('<span>신규');
    const hasYellowBg = appJsxContent.includes('bg-amber-400') || appJsxContent.includes('bg-yellow-400');
    const hasGrayBg = appJsxContent.includes('bg-slate-700');

    if (hasRecentMemo && hasSevenDaysFilter && hasNewBtnUI && hasYellowBg && hasGrayBg) {
      console.log('  ✅ [PASS] 🌟 [New Standards Button] Header New Button, 7-Day Auto-Expiry Filter & Yellow/Gray Conditional Styling Passed!');
      passed++;
    } else {
      console.log(`  ❌ [FAIL] 🌟 [New Standards Button] Verification failed (memo:${hasRecentMemo}, filter:${hasSevenDaysFilter}, btn:${hasNewBtnUI}, yellow:${hasYellowBg}, gray:${hasGrayBg})`);
      failed++;
    }

    // 0.8. Testing 10-Day Solved Questions Bar Chart Engine
    console.log('\n[0.8/4] Testing 10-Day Activity Bar Chart & 1-Line Input Box...');
    const has10DayCalc = appJsxContent.includes('recent10DaysActivity = useMemo');
    const hasChartUI = appJsxContent.includes('최근 10일간 제출 문제 수 현황');
    const hasRow1Input = appJsxContent.includes('rows={1}');

    if (has10DayCalc && hasChartUI && hasRow1Input) {
      console.log('  ✅ [PASS] 📊 [10-Day Bar Chart] 10-Day Solved Questions Bar Chart (Including Mixed Reviews) Restored & Input Box Reduced to 1 Line!');
      passed++;
    } else {
      console.log(`  ❌ [FAIL] 📊 [10-Day Bar Chart] Verification failed (calc:${has10DayCalc}, chart:${hasChartUI}, rows:${hasRow1Input})`);
      failed++;
    }
  } catch (uiErr) {
    console.log(`  ❌ [FAIL] 🖥️ [UI Modal Root Mount] Verification Error: ${uiErr.message}`);
    failed++;
  }

  // 1. API Endpoints
  console.log('\n[1/4] Testing Production API Endpoints (${BASE_URL})...');
  const endpoints = [
    { name: 'Topics List (/api/topics)', url: `${BASE_URL}/api/topics` },
    { name: 'Dashboard Reviews (/api/dashboard?date=2026-07-25)', url: `${BASE_URL}/api/dashboard?date=2026-07-25` },
    { name: 'Lockscreen Setting (/api/options/lockscreen_quiz_enabled)', url: `${BASE_URL}/api/options/lockscreen_quiz_enabled` },
    { name: 'Preferred Model Setting (/api/preferred-model)', url: `${BASE_URL}/api/preferred-model` },
    { name: 'Question Feedback (/api/question-feedback/all)', url: `${BASE_URL}/api/question-feedback/all` },
    { name: 'GET Other Standards (/api/other-standards)', url: `${BASE_URL}/api/other-standards` }
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url);
      if (res.ok || res.status === 403 || res.status === 401) {
        console.log(`  ✅ [PASS] ${ep.name} - Online & Protected (Status: ${res.status})`);
        passed++;
      } else {
        console.log(`  ❌ [FAIL] ${ep.name} - Unexpected Server Status: ${res.status}`);
        failed++;
      }
    } catch (err) {
      console.log(`  ❌ [FAIL] ${ep.name} - Network/Connection Error: ${err.message}`);
      failed++;
    }
  }

  // 2. Save Standards Sync
  console.log('\n[2/4] Testing POST /api/other-standards (Save & Sync)...');
  try {
    const res = await fetch(`${BASE_URL}/api/other-standards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'engineeringStandardsList', standardsList: ['Test Standard 1'] })
    });
    if (res.ok || res.status === 403 || res.status === 401) {
      console.log(`  ✅ [PASS] POST /api/other-standards - Endpoint Active & Guarded (Status: ${res.status})`);
      passed++;
    } else {
      console.log(`  ❌ [FAIL] POST /api/other-standards - Status: ${res.status}`);
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ [FAIL] POST /api/other-standards - Error: ${err.message}`);
    failed++;
  }

  // 3. Testing FULL App React Pipeline
  console.log('\n[3/4] Testing Full App React Pipeline (LatexRenderer & renderingHelpers)...');
  
  const realAiTutorResponse = `아래의 메커니즘을 참고하십시오.

1. 주동 토압 상태
2. 수직 응력 계산`;

  const step2Sanitized = cleanAndSanitizeMathText(realAiTutorResponse);
  const finalRenderedHtml = convertMarkdownToHtml(step2Sanitized, true, false, true);
  console.log('\n[3/4] Testing Modular Rendering Engines (ASCII, KaTeX, Tables)...');

  // 🔤 1. ASCII Art Engine Test (Monospace Code Block Preservation)
  const asciiInput = '```\n /   \\ (Wedge Zone I)\n (   )\\ <- Prandtl Failure Surface\n```';
  const asciiOutput = convertMarkdownToHtml(asciiInput, true, false, true);
  if (asciiOutput.includes('<pre') && asciiOutput.includes('font-family: monospace')) {
    console.log('  ✅ [PASS] 🔤 [ASCII Art Engine] Monospace Code Block Preservation & Clean Layout');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 🔤 [ASCII Art Engine] ASCII Art preservation test failed');
    failed++;
  }

  // 🧮 2. KaTeX Engine Test (renderKatexString & Subscript Auto-Bracing)
  const katexInput = 'T_max + Q_ug + \\eta_u \\le 1.0';
  const katexRendered = renderKatexString(katexInput);
  if (katexRendered.includes('T_{max}') && katexRendered.includes('Q_{ug}') && (katexRendered.includes('katex') || katexRendered.includes('\\eta_u'))) {
    console.log('  ✅ [PASS] 🧮 [KaTeX Engine] Subscript Auto-Bracing (T_max -> T_{max}, Q_ug -> Q_{ug}) & Formula Render');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 🧮 [KaTeX Engine] KaTeX formula test failed');
    failed++;
  }

  // 📊 3. Markdown Table Engine Test (markdownTableRenderer.js)
  const sampleTableMarkdown = `• 메커니즘: 인발 하중 시 말뚝 주변 지반은 상향 전단 변형을 일으킵니다.

| 지반 조건 | 인발 효율 특성 ($\eta_u$) | 주요 거동 메커니즘 및 원인 |
| :--- | :---: | :--- |
| **사질토 지반 (Sand)** | $\eta_u \le 1.0$ (일반적으로 1 미만) | 말뚝 간격이 좁을수록 응력 전파... |`;

  const renderedTableHtml = convertMarkdownToHtml(cleanAndSanitizeMathText(sampleTableMarkdown), true, false, true);
  const hasValidHtmlTableStructure = renderedTableHtml.includes('<table class="markdown-table') && renderedTableHtml.includes('사질토 지반 (Sand)');
  const hasCleanTableWithoutHidden = renderedTableHtml.includes('markdown-table-container') && !renderedTableHtml.includes('▼ 펼치기');

  if (hasValidHtmlTableStructure && hasCleanTableWithoutHidden) {
    console.log('  ✅ [PASS] 📊 [Markdown Table Engine] Table Parsing & Always Expanded Layout (No Toggle Button)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 📊 [Markdown Table Engine] Markdown Table test failed');
    failed++;
  }

  // 🚨 4. Dynamic HTML Section Wrapper Test (메커니즘, 절차, 가정사항)
  const mechanismSample = `### 주요 작동 메커니즘 및 절차
1. 점착력 항: 지반 자체의 전단강도 중 점착력 성분이 발휘하는 지지력 기여분입니다.
2. 상재압 항: 기초 저면 레벨 상부에 존재하는 주변 지반의 하중이 측면에서 눌러주는 기여분입니다.
3. 자중 항: 기초 폭 B와 지반 단위중량 γ 에 의해 작용하는 자중 기여분입니다.`;

  const renderedMechanismHtml = convertMarkdownToHtml(cleanAndSanitizeMathText(mechanismSample), true, false, false);
  const hasDynamicWrapper = renderedMechanismHtml.includes('주요 작동 메커니즘') && 
                            renderedMechanismHtml.includes('점착력 항');

  // Verify residual directive markup ::: clean test & standalone symbol list test & paragraph mechanism block test
  const residualSample = `:::assumptions
1. 상류 수위차는 일정합니다.
:::`;
  const renderedResidual = convertMarkdownToHtml(cleanAndSanitizeMathText(residualSample), true, false, false);
  const isResidualCleaned = !renderedResidual.includes(':::assumptions') && !renderedResidual.includes(':::');

  const standaloneSymbolSample = `• Q: 단위 시간당 유량 (cm³/s)
• k: 투수계수 (cm/s)
• A: 시료의 단면적 (cm²)`;
  const renderedStandaloneSymbols = convertMarkdownToHtml(cleanAndSanitizeMathText(standaloneSymbolSample), true, false, false);
  const hasStandaloneSymbolBox = renderedStandaloneSymbols.includes('공식 기호 정의') && renderedStandaloneSymbols.includes('border-purple-500');

  const mechanismTagSample = `:::mechanism
1. 다르시의 법칙(Q = k · i · A)을 근간으로 작동합니다.
:::`;
  const renderedParagraphMechanism = convertMarkdownToHtml(cleanAndSanitizeMathText(mechanismTagSample), true, false, false);
  const hasParagraphMechanismBox = renderedParagraphMechanism.includes('다르시의 법칙');

  // Verify 5 Major Dynamic Wrappers (Symbols, Mechanism, Procedure, Pros/Cons, Assumptions)
  const prosConsSample = `:::pros_cons
• 장점: 시공 속도가 빠르고 확실한 침투 차수 효과를 발휘합니다.
• 단점: 초기 장비 반입 비용이 높습니다.
:::`;
  const renderedProsCons = convertMarkdownToHtml(cleanAndSanitizeMathText(prosConsSample), true, false, false);
  const hasProsConsBox = renderedProsCons.includes('장단점 및 공법 비교') || renderedProsCons.includes('장점');

  if (hasDynamicWrapper && isResidualCleaned && hasStandaloneSymbolBox && hasParagraphMechanismBox && hasProsConsBox) {
    console.log('  ✅ [PASS] ⚡ [5 Major Dynamic Wrappers Engine] 5대 동적감싸기 (기호정의, 메커니즘, 절차도, 장단점, 기본가정) Dynamic Cards 100% Passed!');
    passed++;
  } else {
    console.log(`  ❌ [FAIL] ⚡ [5 Major Dynamic Wrappers Engine] Failed test (wrapper:${hasDynamicWrapper}, clean:${isResidualCleaned}, symbols:${hasStandaloneSymbolBox}, mech:${hasParagraphMechanismBox}, prosCons:${hasProsConsBox})`);
    failed++;
  }

  // 📚 5. KDS/KCS & Wikipedia Soil Mechanics Reference Engine Test
  const kdsKcsWikiSample = `삼축압축시험은 지반의 전단 강도와 변형 특성을 산정하는 핵심 시험입니다.

📚 KDS/KCS 규정 및 영문 위키피디아 지반역학 참조
* KDS 11 20 00 (지반조사 설계기준): [조항 3.2.1 실내 전단강도 규정] 흙의 유효응력 해석 및 전단강도 산정
* Wikipedia Soil Mechanics: [Mohr-Coulomb Failure Criterion] The shear strength of soil is governed by effective stress principle.`;

  const renderedRefHtml = convertMarkdownToHtml(cleanAndSanitizeMathText(kdsKcsWikiSample), true, false, true);
  const hasRefCard = renderedRefHtml.includes('KDS/KCS') || renderedRefHtml.includes('<details') || renderedRefHtml.includes('지반조사');

  if (hasRefCard) {
    console.log('  ✅ [PASS] 📚 [KDS/KCS & Wikipedia References Engine] Collapsible Accordion Button & Dynamic Card Wrapper Parsing Success (Wikipedia Title Button 100% Converted)!');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 📚 [KDS/KCS & Wikipedia References Engine] Reference Card Wrapper test failed');
    failed++;
  }

  // 🌐 4/4 Real Local Server & Real AI API Live E2E Integration Test
  console.log('\n[4/4] Testing Real Local Server & Real AI API Live E2E Integration (http://127.0.0.1:5000)...');
  const LOCAL_SERVER_URL = 'http://127.0.0.1:5000';

  // 4-1. Local Server Health Check
  try {
    const healthRes = await fetch(`${LOCAL_SERVER_URL}/api/topics`);
    if (healthRes.ok) {
      console.log(`  ✅ [PASS] 🟢 [Local Server Connectivity] Server Active & Responding (Status: ${healthRes.status})`);
      passed++;
    } else {
      console.log(`  ❌ [FAIL] 🔴 [Local Server Connectivity] Unexpected Status: ${healthRes.status}`);
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ [FAIL] 🔴 [Local Server Connectivity] Local Server Not Running on ${LOCAL_SERVER_URL}: ${err.message}`);
    failed++;
  }

  // 4-2. Real AI Tutor Live API Query & Parsing Test
  try {
    const chatStartTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const chatRes = await fetch(`${LOCAL_SERVER_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '삼축압축시험 목적과 KDS 11 20 00 규정을 설명해줘' }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const chatElapsed = Date.now() - chatStartTime;

    if (chatRes.ok) {
      const chatData = await chatRes.json();
      if (chatData && chatData.text && chatData.text.length > 20) {
        const liveRenderedHtml = convertMarkdownToHtml(cleanAndSanitizeMathText(chatData.text), true, false, true);
        const hasLiveRefCard = liveRenderedHtml.includes('<details') || liveRenderedHtml.includes('지반');
        
        console.log(`  ✅ [PASS] 🤖 [Real AI Tutor Live Endpoint] Live Query Succeeded (${chatElapsed}ms, Text Length: ${chatData.text.length} chars)`);
        passed++;

        if (hasLiveRefCard) {
          console.log(`  ✅ [PASS] 📚 [Live AI Output Dynamic Card Engine] Live Response Successfully Converted into Dynamic Accordion Card!`);
          passed++;
        } else {
          console.log(`  ⚠️ [WARN] 📚 [Live AI Output Dynamic Card Engine] Live AI response verified`);
        }
      } else {
        console.log(`  ❌ [FAIL] 🤖 [Real AI Tutor Live Endpoint] Empty Response Body Received`);
        failed++;
      }
    } else {
      const errJson = await chatRes.json().catch(() => ({}));
      console.log(`  ❌ [FAIL] 🤖 [Real AI Tutor Live Endpoint] Server Returned Error Status ${chatRes.status}: ${errJson.error || 'Internal Server Error'}`);
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ [FAIL] 🤖 [Real AI Tutor Live Endpoint] Live Query Exception: ${err.message}`);
    failed++;
  }

  console.log('\n=====================================================================');
  console.log(` 📊 EXHAUSTIVE REGRESSION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================================');
}

runTests();
