import { processAiTutorDiagrams } from './client/src/components/AiTutorDiagramPlugin.js';
import { convertMarkdownToHtml, cleanAndSanitizeMathText } from './client/src/utils/renderingHelpers.js';

const fetch = globalThis.fetch;
const BASE_URL = process.env.TEST_URL || 'https://anti.vercel.app';

async function runTests() {
  console.log('=====================================================================');
  console.log(' 🤖 ANTIGRAVITY AUTOMATED MASTER REGRESSION TEST SUITE ');
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
      // 200 OK (Public/Authed) or 403 Forbidden (Auth Protected) means the endpoint is online & protecting access
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
  
  // Test A: 100% Real-World AI Tutor Chat Message Pipeline Test (Screenshot Exact Format)
  const realAiTutorResponse = `해 드립니다.

아래의 SVG 코드를 복사하여 \`.svg\` 확장자로 저장한 뒤 웹 브라우저에서 열어보시면, 랭킨 토압의 주동·수동 상태와 벽체 배면의 토압 분포를 정밀한 도해로 확인하실 수 있습니다.

**1. 랭킨 주동·수동 상태 및 토압 분포 SVG 도해**

\`\`\`xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
  <defs>
    <linearGradient id="wallGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#475569"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="800" height="600" fill="#0f172a"/>
  <path d="M 100 100 L 700 500" stroke="#38bdf8" stroke-width="3"/>
  <text x="400" y="580" fill="#94a3b8" text-anchor="middle">[ 랭킨(Rankine) 토압 이론 및 배면 토압 분포 도해 ]</text>
</svg>
\`\`\``;

  // 100% Real-world AI Tutor Component Pipeline Execution
  const step1Diagrams = processAiTutorDiagrams(realAiTutorResponse);
  const step2Sanitized = cleanAndSanitizeMathText(step1Diagrams);
  const finalRenderedHtml = convertMarkdownToHtml(step2Sanitized, true, false, true);

  const hasOuterCardContainer = finalRenderedHtml.includes('bg-[#0b0f19]') && finalRenderedHtml.includes('rounded-2xl');
  const hasUnescapedHeaderTag = finalRenderedHtml.includes('<h4 class="text-xs') && !finalRenderedHtml.includes('&lt;h4');
  const hasValidInnerSvgGraphic = finalRenderedHtml.includes('<svg') && finalRenderedHtml.includes('</svg>') && finalRenderedHtml.includes('<path d=') && finalRenderedHtml.includes('<rect');
  const hasNoMathCorruption = !finalRenderedHtml.includes('<svg$') && !finalRenderedHtml.includes('___INLINE_MATH_');

  const isRealTutorPipelineSuccess = hasOuterCardContainer && hasUnescapedHeaderTag && hasValidInnerSvgGraphic && hasNoMathCorruption;

  if (isRealTutorPipelineSuccess) {
    console.log('  ✅ [PASS] Full App React Pipeline - Real AI Tutor Chat Message (100% Environment Match: Inner SVG <path>, <rect> & HTML card preserved without escaping or math dollar corruption)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - Real AI Tutor Chat Message failed strict environment match test');
    failed++;
  }

  // Test B: Real-world TikZ input (Screenshot 3 format)
  const testTikzInput = '```latex\n\\documentclass[tikz, border=10pt]{standalone}\n\\usepackage{tikz}\n\\begin{document}\n\\begin{tikzpicture}[\n  node distance = 1.2cm,\n  corebox/.style={rectangle, rounded corners=6pt}\n]\n\\node (box1) {1단계: 테르자기 지지력 검토};\n\\node (box2) {2단계: B-Value 검증?};\n\\end{tikzpicture}\n\\end{document}\n```';
  const fullTikzPipelineOutput = convertMarkdownToHtml(processAiTutorDiagrams(testTikzInput), true, false, true);
  if (fullTikzPipelineOutput.includes('1단계: 테르자기 지지력 검토') && fullTikzPipelineOutput.includes('polygon') && fullTikzPipelineOutput.includes('svg')) {
    console.log('  ✅ [PASS] Full App React Pipeline - TikZ Flowchart (Converted to 2D Vector SVG with decision diamonds in React pipeline)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - TikZ Flowchart failed in convertMarkdownToHtml');
    failed++;
  }

  // Test C: Real-world Mermaid input (Screenshot 2 format)
  const testMermaidInput = '```\ngraph TD\n  Core["테르자기(Terzaghi) 극한지력 기본 공식\n  * q_u = c * N_c + q * N_q"]: :::core\n  BVal["Skempton B값 B = Δu/Δσ3 ≥ 0.95 검증?"]: :::alert\n```';
  const fullMermaidPipelineOutput = convertMarkdownToHtml(processAiTutorDiagrams(testMermaidInput), true, false, true);
  if (fullMermaidPipelineOutput.includes('테르자기(Terzaghi) 극한지력 기본 공식') && fullMermaidPipelineOutput.includes('polygon') && fullMermaidPipelineOutput.includes('svg')) {
    console.log('  ✅ [PASS] Full App React Pipeline - Mermaid Flowchart (Converted to 2D Vector SVG with decision diamonds in React pipeline)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - Mermaid Flowchart failed in convertMarkdownToHtml');
    failed++;
  }

  // Test E: Pure ASCII Art Diagram (Prandtl-Terzaghi Failure Surface / Soil Layer ASCII Diagram without [1], [2] step numbers)
  const asciiArtInput = '```\n /                                 \\\n /                                 \\ (탄성 영역: Wedge Zone, I)\n / ( I )                           \\\n /                                 \\ <- 방사형 전단 영역 (Radial Shear Zone, II)\n (                                 )\\\n (                                 )\\ <- Prandtl 파괴면 (Failure Surface)\n```';
  const fullAsciiPipelineOutput = convertMarkdownToHtml(processAiTutorDiagrams(asciiArtInput), true, false, true);
  if (fullAsciiPipelineOutput.includes('<pre') && fullAsciiPipelineOutput.includes('font-family: monospace') && !fullAsciiPipelineOutput.includes('flowchart-text-force') && !fullAsciiPipelineOutput.includes('Realtime Vector')) {
    console.log('  ✅ [PASS] Full App React Pipeline - ASCII Art Graphic Diagram (Preserved cleanly as Monospace Code Block without flowchart card conversion)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - ASCII Art Graphic Diagram failed preservation test');
    failed++;
  }

  console.log('\n=====================================================================');
  console.log(` 📊 REGRESSION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================================');
}

runTests();
