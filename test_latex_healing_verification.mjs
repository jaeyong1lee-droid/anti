import katex from './client/node_modules/katex/dist/katex.mjs';
import { healLatexFormulas } from './client/src/utils/latexUtils.js';
import { renderKatexString, cleanAndSanitizeMathText, buildHtmlDocument } from './client/src/utils/renderingHelpers.js';

// Setup window.katex for renderKatexString in Node environment
globalThis.window = globalThis.window || {};
globalThis.window.katex = katex;

console.log("=================================================");
console.log("🧪 순서도(Flowchart) 수식 자가치유 종합 검증 테스트");
console.log("=================================================\n");

const testCases = [
  "- s_f = s_0 + ₩dfrac{1}{\\beta} 공식 및 U = \\frac{s_t}{s_f} \\times 100\\% 산출",
  "침하량 $S_{ult} = S_0 + \\frac{1}{\\beta} \\beta } = 100 + 120 = 220$ 이 아니라",
  '<span class="katex-error" style="color: #cc0000;" title="KaTeX error: ParseError: KaTeX parse error: Expected \'EOF\', got \'}\' at position 35: ...\\frac{1}{\\beta} \\beta } = 100 + 120 = 220">} = 100 + 120 = 220</span>'
];

let hasError = false;

testCases.forEach((testInput, tIdx) => {
  console.log(`\n--- [테스트케이스 ${tIdx + 1}] ---`);
  console.log("📥 입력 본문:", testInput);

  const sanitized = cleanAndSanitizeMathText(testInput);
  const healed = healLatexFormulas(sanitized);

  console.log("🩹 치유 결과:", healed);

  const formulas = [];
  const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^\$\n]+)\$/g;
  let match;
  while ((match = mathRegex.exec(healed)) !== null) {
    formulas.push((match[1] || match[2]).trim());
  }

  console.log("📐 추출된 LaTeX 수식 목록:", formulas);

  formulas.forEach((f, idx) => {
    const rendered = renderKatexString(f);
    if (rendered.includes('katex-error')) {
      console.error(`❌ [KaTeX Error] 수식 ${idx + 1} ("${f}") 렌더링 실패!`);
      hasError = true;
    } else {
      console.log(`  ✓ 수식 ${idx + 1} ("${f}") KaTeX 정상 렌더링 성공`);
    }
  });
});

if (hasError) {
  console.error("\n❌ 수식 검증 실패!");
  process.exit(1);
} else {
  console.log("\n✅ [검증 성공] 수식 자가치유 및 렌더링 100% 정상 작동 확인!");
  process.exit(0);
}
