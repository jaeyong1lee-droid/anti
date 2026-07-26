import katex from './client/node_modules/katex/dist/katex.mjs';
import { healLatexFormulas } from './client/src/utils/latexUtils.js';
import { renderKatexString, cleanAndSanitizeMathText, buildHtmlDocument } from './client/src/utils/renderingHelpers.js';

// Setup window.katex for renderKatexString in Node environment
globalThis.window = globalThis.window || {};
globalThis.window.katex = katex;

console.log("=================================================");
console.log("🧪 순서도(Flowchart) 수식 자가치유 종합 검증 테스트");
console.log("=================================================\n");

const flowchartCase = "- s_f = s_0 + ₩dfrac{1}{\\beta} 공식 및 U = \\frac{s_t}{s_f} \\times 100\\% 산출";

console.log("📥 순서도 입력 본문:\n", flowchartCase);

const sanitized = cleanAndSanitizeMathText(flowchartCase);
const healed = healLatexFormulas(sanitized);

console.log("\n🩹 치유 결과:\n", healed);

const formulas = [];
const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^\$\n]+)\$/g;
let match;
while ((match = mathRegex.exec(healed)) !== null) {
  formulas.push((match[1] || match[2]).trim());
}

console.log("\n📐 추출된 LaTeX 수식 목록:", formulas);

let hasError = false;
formulas.forEach((f, idx) => {
  const rendered = renderKatexString(f);
  if (rendered.includes('katex-error')) {
    console.error(`❌ [KaTeX Error] 수식 ${idx + 1} ("${f}") 렌더링 실패!`);
    hasError = true;
  } else {
    console.log(`  ✓ 수식 ${idx + 1} ("${f}") KaTeX 정상 렌더링 성공`);
  }
});

if (hasError) {
  console.error("\n❌ 순서도 수식 검증 실패!");
  process.exit(1);
} else {
  console.log("\n✅ [검증 성공] 순서도 수식 100% 정상 렌더링 완료!");
  process.exit(0);
}
