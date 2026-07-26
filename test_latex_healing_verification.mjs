import katex from './client/node_modules/katex/dist/katex.mjs';
import { healLatexFormulas } from './client/src/utils/latexUtils.js';
import { renderKatexString, cleanAndSanitizeMathText, buildHtmlDocument } from './client/src/utils/renderingHelpers.js';

// Setup window.katex for renderKatexString in Node environment
globalThis.window = globalThis.window || {};
globalThis.window.katex = katex;

console.log("=================================================");
console.log("🧪 수식 자가치유 & HTML 리포트 통합 검증 테스트");
console.log("=================================================\n");

const testCases = [
  {
    name: "1. 유저 스크린샷 본문 패러그래프 전체 (s_{t- \\Delta t} 포함)",
    input: "일차원 압밀방정식의 해를 이용하면 임의의 시간 $t$ 에서의 침하량 $s_t$ 와 일정 시간 간격 $\\Delta t$ 이전의 침하량 s_{t- \\Delta t} 사이에는 선형 관계가 성립한다는 원리에 기초한다."
  },
  {
    name: "2. 쌍곡선 식 및 원화기호(₩) 공식 포함 해설",
    input: "최종 침하량 S_{ult} = S_0 + ₩dfrac{1}{\\beta} = 100 + 120 = 220 이 아니라 계산값 재검토 시 S_{ult} = 100 + 100 = 200 cm 가 정답임."
  },
  {
    name: "3. DB 저장용 파손 HTML 태그 (<span class=\"katex-error\">...)",
    input: `<span class="katex-error" style="color:#cc0000; font-family: monospace;" title="KaTeX error: S_{ult} = S_0 + ₩dfrac{1}{\\beta} = 100 + 120 = 220">S_{ult} = S_0 + ₩dfrac{1}{\\beta} = 100 + 120 = 220</span> 이 아니라 계산값 재검토 시 S_{ult} = 100 + 100 = 200 cm 가 정답임.`
  }
];

let totalPassed = 0;
let totalFailed = 0;

testCases.forEach((tc, idx) => {
  console.log(`-------------------------------------------------`);
  console.log(`테스트 [${idx + 1}]: ${tc.name}`);
  console.log(`📥 입력: ${tc.input}`);

  // Step 1: buildHtmlDocument 검증 (HTML 리포트용)
  const htmlDoc = buildHtmlDocument(tc.input, false);
  if (htmlDoc.includes("'$$' + node.nodeValue + '$$'")) {
    console.error(`❌ [오류] buildHtmlDocument healIframeMath 오작동 감지!`);
    totalFailed++;
    return;
  }

  // Step 2: cleanAndSanitizeMathText 및 healLatexFormulas 정제
  const sanitized = cleanAndSanitizeMathText(tc.input);
  const healed = healLatexFormulas(sanitized);
  console.log(`🩹 치유 결과: ${healed}`);

  // Step 3: 미감싸진 깨진 수식 조각 감지
  const plainTextOutsideMath = healed.replace(/\$\$[\s\S]*?\$\$|\$[^\$\n]+\$/g, '');
  const hasBrokenFragment = /s_\{t-|t\}_|\}_=|₩/i.test(plainTextOutsideMath);

  if (hasBrokenFragment) {
    console.error(`❌ [오류] 텍스트 영역에 깨진 수식 조각 남음: "${plainTextOutsideMath}"`);
    totalFailed++;
    return;
  }

  // Step 4: KaTeX 렌더링 검증
  const formulas = [];
  const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^\$\n]+)\$/g;
  let match;
  while ((match = mathRegex.exec(healed)) !== null) {
    formulas.push((match[1] || match[2]).trim());
  }

  let katexError = false;
  formulas.forEach((f, fIdx) => {
    const rendered = renderKatexString(f);
    if (rendered.includes('katex-error')) {
      console.error(`❌ [KaTeX Error] 수식 ${fIdx + 1} ("${f}") 렌더링 실패!`);
      katexError = true;
    } else {
      console.log(`  ✓ 수식 ${fIdx + 1} ("${f}") KaTeX 정상 렌더링 성공`);
    }
  });

  if (!katexError) {
    console.log(`✅ 테스트 [${idx + 1}] 성공!`);
    totalPassed++;
  } else {
    totalFailed++;
  }
});

console.log("\n=================================================");
console.log(`📊 최종 검증 결과: 전체 ${testCases.length}건 중 성공 ${totalPassed}건 / 실패 ${totalFailed}건`);
console.log("=================================================");

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
