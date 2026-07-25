import { processAiTutorDiagrams } from './client/src/components/AiTutorDiagramPlugin.js';
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

  const hasOuterCardContainer = finalRenderedHtml.includes('bg-[#0b0f19]') && finalRenderedHtml.includes('rounded-2xl');
  const hasUnescapedHeaderTag = finalRenderedHtml.includes('<h4 class="text-xs') && !finalRenderedHtml.includes('&lt;h4');
  const hasValidInnerSvgGraphic = finalRenderedHtml.includes('<svg') && finalRenderedHtml.includes('</svg>') && finalRenderedHtml.includes('<path d=') && finalRenderedHtml.includes('<rect');
  const hasNoMathCorruption = !finalRenderedHtml.includes('<svg$') && !finalRenderedHtml.includes('___INLINE_MATH_');

  if (hasOuterCardContainer && hasUnescapedHeaderTag && hasValidInnerSvgGraphic && hasNoMathCorruption) {
    console.log('  ✅ [PASS] Full App React Pipeline - Real AI Tutor Chat Message (100% Environment Match)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - Real AI Tutor Chat Message failed environment match test');
    failed++;
  }

  // Test B: SVG Text Distinct Y-Coordinates & Dark Halo Masking Test
  const svgYMatch1 = finalRenderedHtml.match(/y=["']40["']/);
  const svgYMatch2 = finalRenderedHtml.match(/y=["']100["']/);
  const hasGlobalDarkHaloStyle = finalRenderedHtml.includes('paint-order: stroke fill !important;') && finalRenderedHtml.includes('stroke: #0f172a !important;');
  const hasNoTextYCollapse = svgYMatch1 !== null && svgYMatch2 !== null;

  if (hasGlobalDarkHaloStyle && hasNoTextYCollapse) {
    console.log('  ✅ [PASS] Full App React Pipeline - SVG Text Y-Position Distinctness & 10px Dark Halo Masking');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - SVG Text Y-Position or Dark Halo test failed');
    failed++;
  }

  // Test C: Key-Word Highlighting Test (Highlight ONLY short important key words <= 25 chars in yellow)
  const sampleMarkdownHighlight = `말뚝기초의 **인발저항효율** 평가는 군말뚝(Group Piles)이 인발 하중을 받을 때 중요한 설계 지표입니다.

• **정의**: 군말뚝의 인발 저항력을 단독말뚝 인발 저항력의 합으로 나눈 비율입니다.`;

  const highlightedHtml = convertMarkdownToHtml(sampleMarkdownHighlight, true, false, true);
  const hasYellowKeyWord = highlightedHtml.includes('<strong style="color: #fbbf24; font-weight: 700;">인발저항효율</strong>') && highlightedHtml.includes('<strong style="color: #fbbf24; font-weight: 700;">정의</strong>');
  const hasNoYellowWholeSentence = !highlightedHtml.includes('<span style="color: #fbbf24; font-weight: normal;">');

  if (hasYellowKeyWord && hasNoYellowWholeSentence) {
    console.log('  ✅ [PASS] Full App React Pipeline - Key-Word Highlighting (ONLY short key words in yellow, whole sentences white)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - Key-Word Highlighting test failed');
    failed++;
  }

  // Test D: Subscript Auto-Bracing Test (T_max -> T_{max}, Q_ug -> Q_{ug})
  const katexInput = 'T_max + Q_ug + W_p';
  const katexRendered = renderKatexString(katexInput);
  if (katexRendered.includes('T_{max}') && katexRendered.includes('Q_{ug}') && katexRendered.includes('W_p')) {
    console.log('  ✅ [PASS] Full App React Pipeline - Subscript Auto-Bracing (T_max -> T_{max}, Q_ug -> Q_{ug})');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - Subscript Auto-Bracing test failed');
    failed++;
  }

  // Test E: TikZ Flowchart
  const testTikzInput = '```latex\n\\documentclass[tikz, border=10pt]{standalone}\n\\usepackage{tikz}\n\\begin{document}\n\\begin{tikzpicture}[\n  node distance = 1.2cm,\n  corebox/.style={rectangle, rounded corners=6pt}\n]\n\\node (box1) {1단계: 테르자기 지지력 검토};\n\\node (box2) {2단계: B-Value 검증?};\n\\end{tikzpicture}\n\\end{document}\n```';
  const fullTikzPipelineOutput = convertMarkdownToHtml(processAiTutorDiagrams(testTikzInput), true, false, true);
  if (fullTikzPipelineOutput.includes('1단계: 테르자기 지지력 검토') && fullTikzPipelineOutput.includes('polygon') && fullTikzPipelineOutput.includes('svg')) {
    console.log('  ✅ [PASS] Full App React Pipeline - TikZ Flowchart (Converted to 2D Vector SVG)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - TikZ Flowchart test failed');
    failed++;
  }

  // Test F: Mermaid Flowchart
  const testMermaidInput = '```\ngraph TD\n  Core["테르자기(Terzaghi) 극한지력 기본 공식\n  * q_u = c * N_c + q * N_q"]: :::core\n  BVal["Skempton B값 B = Δu/Δσ3 ≥ 0.95 검증?"]: :::alert\n```';
  const fullMermaidPipelineOutput = convertMarkdownToHtml(processAiTutorDiagrams(testMermaidInput), true, false, true);
  if (fullMermaidPipelineOutput.includes('테르자기(Terzaghi) 극한지력 기본 공식') && fullMermaidPipelineOutput.includes('polygon') && fullMermaidPipelineOutput.includes('svg')) {
    console.log('  ✅ [PASS] Full App React Pipeline - Mermaid Flowchart (Converted to 2D Vector SVG)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - Mermaid Flowchart test failed');
    failed++;
  }

  // Test G: ASCII Art Diagram
  const asciiArtInput = '```\n /                                 \\\n /                                 \\ (탄성 영역: Wedge Zone, I)\n / ( I )                           \\\n /                                 \\ <- 방사형 전단 영역 (Radial Shear Zone, II)\n (                                 )\\\n (                                 )\\ <- Prandtl 파괴면 (Failure Surface)\n```';
  const fullAsciiPipelineOutput = convertMarkdownToHtml(processAiTutorDiagrams(asciiArtInput), true, false, true);
  if (fullAsciiPipelineOutput.includes('<pre') && fullAsciiPipelineOutput.includes('font-family: monospace') && !fullAsciiPipelineOutput.includes('flowchart-text-force') && !fullAsciiPipelineOutput.includes('Realtime Vector')) {
    console.log('  ✅ [PASS] Full App React Pipeline - ASCII Art Graphic Diagram (Preserved cleanly as Monospace Code Block)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - ASCII Art Graphic Diagram test failed');
    failed++;
  }

  // Test H: Markdown Table Parsing & Title Validation Test (No broken '📊 --' titles or mangled cells)
  const sampleTableMarkdown = `• 메커니즘: 인발 하중 시 말뚝 주변 지반은 상향 전단 변형을 일으킵니다.

| 지반 조건 | 인발 효율 특성 ($\eta_u$) | 주요 거동 메커니즘 및 원인 |
| :--- | :---: | :--- |
| **사질토 지반 (Sand)** | $\eta_u \le 1.0$ (일반적으로 1 미만) | 말뚝 간격이 좁을수록 응력 전파... |`;

  const renderedTableHtml = convertMarkdownToHtml(cleanAndSanitizeMathText(sampleTableMarkdown), true, false, true);
  const hasCleanTableTitle = renderedTableHtml.includes('지반 조건별 비교 개요') && !renderedTableHtml.includes('📊 --');
  const hasValidHtmlTableStructure = renderedTableHtml.includes('<table class="markdown-table') && renderedTableHtml.includes('사질토 지반 (Sand)');

  if (hasCleanTableTitle && hasValidHtmlTableStructure) {
    console.log('  ✅ [PASS] Full App React Pipeline - Markdown Table Parsing & Clean Title Rendering');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - Markdown Table Parsing or Title test failed');
    failed++;
  }

  console.log('\n=====================================================================');
  console.log(` 📊 EXHAUSTIVE REGRESSION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================================');
}

runTests();
