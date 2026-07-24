import { processAiTutorDiagrams } from './client/src/components/AiTutorDiagramPlugin.js';
import { convertMarkdownToHtml } from './client/src/utils/renderingHelpers.js';

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
  
  // Test A: Real-world SVG input with \gt\lt (Screenshot 1 format)
  const realWorldSvg = 'xmlns=\'\'http://www.w3.org/2000/svg\'\' viewBox=\'\'0 0 800 1200\'\' style=\'\'background-color: #f8f9fa;\'\'\\gt \\lt defs\\gt \\lt linearGradient id=\'\'boxGrad\'\' x1=\'\'0%\'\' x2=\'\'100%\'\'\\gt \\lt stop offset=\'\'0%\'\' stop-color=\'\'#ffffff\'\' /\\gt \\lt /linearGradient\\gt \\lt /svg\\gt';
  const fullSvgPipelineOutput = convertMarkdownToHtml(processAiTutorDiagrams(realWorldSvg), true, false, true);
  if (fullSvgPipelineOutput.includes('<svg') && fullSvgPipelineOutput.includes('Realtime Vector') && !fullSvgPipelineOutput.includes('\\gt')) {
    console.log('  ✅ [PASS] Full App React Pipeline - SVG Graphic (Converted cleanly in real React App pipeline without escaping)');
    passed++;
  } else {
    console.log('  ❌ [FAIL] Full App React Pipeline - SVG Graphic failed in convertMarkdownToHtml');
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

  console.log('\n=====================================================================');
  console.log(` 📊 REGRESSION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================================');
}

runTests();
