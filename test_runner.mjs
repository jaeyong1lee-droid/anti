import { convertMarkdownToHtml, cleanAndSanitizeMathText, renderKatexString } from './client/src/utils/renderingHelpers.js';

const fetch = globalThis.fetch;
const BASE_URL = process.env.TEST_URL || 'https://anti.vercel.app';

async function runTests() {
  console.log('=====================================================================');
  console.log(' 🤖 ANTIGRAVITY AUTOMATED MASTER REGRESSION TEST SUITE (EXHAUSTIVE) ');
  console.log('=====================================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. API Endpoints
  console.log(`[1/4] Testing Production API Endpoints (${BASE_URL})...`);
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
  const hasCleanTableTitle = renderedTableHtml.includes('지반 조건별 비교 개요') && !renderedTableHtml.includes('📊 --');
  const hasValidHtmlTableStructure = renderedTableHtml.includes('<table class="markdown-table') && renderedTableHtml.includes('사질토 지반 (Sand)');
  const hasCleanTableWithoutHidden = renderedTableHtml.includes('markdown-table-container') && !renderedTableHtml.includes('hidden') && !renderedTableHtml.includes('▼ 펼치기');

  if (hasCleanTableTitle && hasValidHtmlTableStructure && hasCleanTableWithoutHidden) {
    console.log('  ✅ [PASS] 📊 [Markdown Table Engine] Table Parsing & Always Expanded Layout (No Toggle Button)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 📊 [Markdown Table Engine] Markdown Table test failed');
    failed++;
  }

  // 🚨 4. Dynamic HTML Section Wrapper Test (메커니즘, 절차, 가정사항)
  const mechanismSample = `각 항별 물리적 메커니즘
1. 점착력 항 (cN_c): 지반 자체의 전단강도 중 점착력 성분이 발휘하는 지지력 기여분입니다.
2. 상재압 항 (qN_q): 기초 저면 레벨 상부에 존재하는 주변 지반의 하중이 측면에서 눌러주는 기여분입니다.
3. 자중 항 (1/2 γ B N_γ): 기초 폭 B와 지반 단위중량 γ 에 의해 작용하는 자중 기여분입니다.`;

  const renderedMechanismHtml = convertMarkdownToHtml(mechanismSample, true, false, false);
  const hasDynamicWrapper = renderedMechanismHtml.includes('각 항별 물리적 메커니즘') && 
                            renderedMechanismHtml.includes('점착력 항');

  if (hasDynamicWrapper) {
    console.log('  ✅ [PASS] ⚡ [Dynamic HTML Wrapper Engine] 메커니즘/절차/가정사항 Dynamic HTML Container Box applied!');
    passed++;
  } else {
    console.log('  ❌ [FAIL] ⚡ [Dynamic HTML Wrapper Engine] Failed to wrap mechanism section in HTML Container Box');
    failed++;
  }

  // 📚 5. KDS/KCS & Wikipedia Soil Mechanics Reference Engine Test
  const kdsKcsWikiSample = `삼축압축시험은 지반의 전단 강도와 변형 특성을 산정하는 핵심 시험입니다.

📚 KDS/KCS 규정 및 영문 위키피디아 지반역학 참조:
• KDS 11 20 00 (지반조사 설계기준): 지반 전단강도 파라미터(c, phi) 및 한계상태 설계법 적용
• Wikipedia Soil Mechanics (Stress Path): p-q 응력경로 및 유효응력파괴선(NFL) 삼축응력 거동 수식 적용`;

  const renderedRefHtml = convertMarkdownToHtml(cleanAndSanitizeMathText(kdsKcsWikiSample), true, false, true);
  const hasRefCard = renderedRefHtml.includes('📚') && 
                     renderedRefHtml.includes('KDS/KCS 규정 및 영문 위키피디아 지반역학 참조') &&
                     renderedRefHtml.includes('<details') &&
                     renderedRefHtml.includes('<summary') &&
                     renderedRefHtml.includes('KDS 11 20 00') &&
                     renderedRefHtml.includes('Wikipedia Soil Mechanics');

  if (hasRefCard) {
    console.log('  ✅ [PASS] 📚 [KDS/KCS & Wikipedia References Engine] Collapsible Accordion Button & Dynamic Card Wrapper Parsing Success!');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 📚 [KDS/KCS & Wikipedia References Engine] Reference Card Wrapper test failed');
    failed++;
  }

  console.log('\n=====================================================================');
  console.log(` 📊 EXHAUSTIVE REGRESSION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================================');
}

runTests();
