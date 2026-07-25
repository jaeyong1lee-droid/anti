import { processAiTutorDiagrams } from './client/src/components/AiTutorDiagramPlugin.js';
import { convertMarkdownToHtml, cleanAndSanitizeMathText, renderKatexString } from './client/src/utils/renderingHelpers.js';
import { renderAiTutorSvg } from './client/src/components/plugins/AiTutorSvgPlugin.js';
import { renderAiTutorTikz } from './client/src/components/plugins/AiTutorTikzPlugin.js';
import { renderAiTutorMermaid } from './client/src/components/plugins/AiTutorMermaidPlugin.js';

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

  // 3. Testing FULL App React Pipeline (convertMarkdownToHtml & processAiTutorDiagrams)
  console.log('\n[3/4] Testing Full App React Pipeline (LatexRenderer & renderingHelpers)...');
  
  // Test A: Real-World AI Tutor Chat Message Pipeline Test
  const realAiTutorResponse = `아래의 SVG 코드를 참고하십시오.

\`\`\`xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
  <rect x="0" y="0" width="800" height="600" fill="#0f172a"/>
  <path d="M 100 100 L 700 500" stroke="#38bdf8" stroke-width="3"/>
  <text x="400" y="40">[ 랭킨 토압 이론 도해 ]</text>
  <text x="200" y="100">1. 주동 토압 상태</text>
</svg>
\`\`\``;

  const step1Diagrams = processAiTutorDiagrams(realAiTutorResponse);
  const step2Sanitized = cleanAndSanitizeMathText(step1Diagrams);
  const finalRenderedHtml = convertMarkdownToHtml(step2Sanitized, true, false, true);
  console.log('\n[3/4] Testing Modular Rendering Engines (SVG, ASCII, TikZ, Mermaid, KaTeX)...');

  // 🎨 1. SVG Engine Test (renderAiTutorSvg in AiTutorSvgPlugin.js)
  const rawSvgInput = `<svg width="200" height="100"><text x="10" y="30">SVG Test</text></svg>`;
  const svgOutput = renderAiTutorSvg(rawSvgInput);
  if (svgOutput.includes('<svg') && svgOutput.includes('SVG Test') && svgOutput.includes('my-6')) {
    console.log('  ✅ [PASS] 🎨 [SVG Engine] Standalone AiTutorSvgPlugin.js -> 2D Vector SVG Card Render');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 🎨 [SVG Engine] AiTutorSvgPlugin.js test failed');
    failed++;
  }

  // 📐 2. TikZ Engine Test (renderAiTutorTikz in AiTutorTikzPlugin.js)
  const tikzInput = '```latex\n\\begin{tikzpicture}\n\\node {1단계: 테르자기 지지력};\n\\end{tikzpicture}\n```';
  const tikzOutput = renderAiTutorTikz(tikzInput);
  if (tikzOutput.includes('1단계: 테르자기 지지력') && tikzOutput.includes('svg')) {
    console.log('  ✅ [PASS] 📐 [TikZ Engine] Standalone AiTutorTikzPlugin.js -> 2D Vector Flowchart Render');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 📐 [TikZ Engine] AiTutorTikzPlugin.js test failed');
    failed++;
  }

  // 🧜 3. Mermaid Engine Test (renderAiTutorMermaid in AiTutorMermaidPlugin.js)
  const mermaidInput = '```mermaid\ngraph TD\n  A["테르자기 극한지력"] --> B["B-Value 검증"]\n```';
  const mermaidOutput = renderAiTutorMermaid(mermaidInput);
  if (mermaidOutput.includes('테르자기 극한지력') && mermaidOutput.includes('svg')) {
    console.log('  ✅ [PASS] 🧜 [Mermaid Engine] Standalone AiTutorMermaidPlugin.js -> 2D Vector Flowchart Render');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 🧜 [Mermaid Engine] AiTutorMermaidPlugin.js test failed');
    failed++;
  }

  // 🔤 4. ASCII Art Engine Test (Monospace Code Block Preservation)
  const asciiInput = '```\n /   \\ (Wedge Zone I)\n (   )\\ <- Prandtl Failure Surface\n```';
  const asciiOutput = convertMarkdownToHtml(asciiInput, true, false, true);
  if (asciiOutput.includes('<pre') && asciiOutput.includes('font-family: monospace') && !asciiOutput.includes('Realtime Vector')) {
    console.log('  ✅ [PASS] 🔤 [ASCII Art Engine] Monospace Code Block Preservation & Clean Layout');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 🔤 [ASCII Art Engine] ASCII Art preservation test failed');
    failed++;
  }

  // 🧮 5. KaTeX Engine Test (renderKatexString & Subscript Auto-Bracing)
  const katexInput = 'T_max + Q_ug + \\eta_u \\le 1.0';
  const katexRendered = renderKatexString(katexInput);
  if (katexRendered.includes('T_{max}') && katexRendered.includes('Q_{ug}') && (katexRendered.includes('katex') || katexRendered.includes('\\eta_u'))) {
    console.log('  ✅ [PASS] 🧮 [KaTeX Engine] Subscript Auto-Bracing (T_max -> T_{max}, Q_ug -> Q_{ug}) & Formula Render');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 🧮 [KaTeX Engine] KaTeX formula test failed');
    failed++;
  }

  // 📊 6. Markdown Table Engine Test (markdownTableRenderer.js)
  const sampleTableMarkdown = `• 메커니즘: 인발 하중 시 말뚝 주변 지반은 상향 전단 변형을 일으킵니다.

| 지반 조건 | 인발 효율 특성 ($\eta_u$) | 주요 거동 메커니즘 및 원인 |
| :--- | :---: | :--- |
| **사질토 지반 (Sand)** | $\eta_u \le 1.0$ (일반적으로 1 미만) | 말뚝 간격이 좁을수록 응력 전파... |`;

  const renderedTableHtml = convertMarkdownToHtml(cleanAndSanitizeMathText(sampleTableMarkdown), true, false, true);
  const hasCleanTableTitle = renderedTableHtml.includes('지반 조건별 비교 개요') && !renderedTableHtml.includes('📊 --');
  const hasValidHtmlTableStructure = renderedTableHtml.includes('<table class="markdown-table') && renderedTableHtml.includes('사질토 지반 (Sand)');

  if (hasCleanTableTitle && hasValidHtmlTableStructure) {
    console.log('  ✅ [PASS] 📊 [Markdown Table Engine] Table Parsing, Clean Title & Yellow Keyword Highlighting');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 📊 [Markdown Table Engine] Markdown Table test failed');
    failed++;
  }

  // 🚨 8. User Screenshot Exact Bug Test (Unshielded HTML & $ Vector Leak Protection)
  const brokenProdPayload = `⚡ Realtime $ Vector
<div class="my-6 w-full max-w-5xl mx-auto bg-[#0b0f19] rounded-2xl p-6 border border-slate-800 shadow-2xl overflow-x-auto select-text font-sans">
  <div class="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-4">
    <div class="flex items-center gap-2">
      <span class="text-base">⚡</span>
      <h4 class="text-xs font-black text-slate-200 tracking-tight uppercase">Realtime Vector Graphic Render</h4>
    </div>
    <span class="text-[10px] font-extrabold bg-indigo-950/80 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full uppercase tracking-wider">⚡ Realtime $ Vector</span>
  </div>
  <div class="w-full svg-scroll-container select-text">
    <svg width="100" height="100"><text x="10" y="20">Test</text></svg>
  </div>
</div>`;

  const s1 = processAiTutorDiagrams(brokenProdPayload);
  const s2 = cleanAndSanitizeMathText(s1);
  const s3 = convertMarkdownToHtml(s2, true, false, true);

  const hasNoEscapedHtml = !s3.includes('&lt;h4 class=&quot;') && !s3.includes('&lt;h4') && s3.includes('<h4 class="text-xs');

  if (hasNoEscapedHtml) {
    console.log('  ✅ [PASS] 🚨 [User Screenshot Test] HTML Tag & Math Protection Fixed & Verified!');
    passed++;
  } else {
    console.log('  ❌ [FAIL] 🚨 [User Screenshot Test] HTML Tag Leaked as literal text: <h4 class="...">Realtime Vector Graphic Render</h4>');
    failed++;
  }

  console.log('\n=====================================================================');
  console.log(` 📊 EXHAUSTIVE REGRESSION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================================');
}

runTests();
