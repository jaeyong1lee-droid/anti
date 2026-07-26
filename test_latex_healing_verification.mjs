import katex from './client/node_modules/katex/dist/katex.mjs';
import { healLatexFormulas } from './client/src/utils/latexUtils.js';
import { renderKatexString } from './client/src/utils/renderingHelpers.js';

// Setup window.katex for renderKatexString in Node environment
globalThis.window = globalThis.window || {};
globalThis.window.katex = katex;

console.log("=================================================");
console.log("🧪 수식 자가치유 & KaTeX 렌더링 실시간 검증 시작");
console.log("=================================================\n");

const testCases = [
  {
    name: "1. 스크린샷 1의 이전 침하량 수식 (s_{t- \\Delta t})",
    input: "이전의 침하량 s_{t- \\Delta t} 사이에는 선형 관계가 성립한다."
  },
  {
    name: "2. 스크린샷 2의 원화기호(₩) 및 쌍곡선 수식 (S_{ult} = S_0 + ₩dfrac...)",
    input: "최종 침하량 S_{ult} = S_0 + ₩dfrac{1}{\\beta} = 100 + 120 = 220 이 아니라 계산값 재검토 시 S_{ult} = 100 + 100 = 200 cm 가 정답임."
  },
  {
    name: "3. 스크린샷 3 콘솔 에러 유발 단편 수식 및 중첩 아래첨자 (\\beta_{0,\\beta_1})",
    input: "회귀계수 \\beta_{0,\\beta_1} 의 추정값 및 s_{t-\\Delta t} 분석"
  },
  {
    name: "4. 일반 아래첨자 변수 (S_{max}, S_{ult}, V_s)",
    input: "최대 발생 침하량 S_{max} 와 지반손실 체적량 V_s 및 최종 장래 침하량 S_{ult}"
  }
];

let totalPassed = 0;
let totalFailed = 0;

testCases.forEach((tc, idx) => {
  console.log(`-------------------------------------------------`);
  console.log(`테스트 [${idx + 1}]: ${tc.name}`);
  console.log(`📥 입력: ${tc.input}`);

  // Step 1: healLatexFormulas 치유 테스트
  const healed = healLatexFormulas(tc.input);
  console.log(`🩹 치유 결과: ${healed}`);

  // Step 2: 텍스트 영역에 깨진 수식 조각이 남았는지 검증 (수식 블록 $...$ 제거 후 잔여 텍스트 검사)
  const plainTextOutsideMath = healed.replace(/\$\$[\s\S]*?\$\$|\$[^\$\n]+\$/g, '');
  const hasUnwrappedBrokenFragment = /s_\{t-|t\}_|\}_=|₩/i.test(plainTextOutsideMath);
  
  if (hasUnwrappedBrokenFragment) {
    console.error(`❌ [오류] 텍스트 영역에 미감싸진 깨진 수식 조각이 남아있습니다: "${plainTextOutsideMath}"`);
    totalFailed++;
    return;
  }

  // Step 3: 추출된 수식 블록 ($...$ 또는 $$...$$) KaTeX 렌더링 검증
  const formulas = [];
  const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^\$\n]+)\$/g;
  let match;
  while ((match = mathRegex.exec(healed)) !== null) {
    const mathContent = match[1] || match[2];
    formulas.push(mathContent.trim());
  }

  console.log(`📐 추출된 LaTeX 수식 (${formulas.length}개):`, formulas);

  let katexErrorOccurred = false;
  formulas.forEach((f, fIdx) => {
    try {
      const renderedHtml = renderKatexString(f);
      if (renderedHtml.includes('katex-error')) {
        console.error(`❌ [KaTeX Error] 수식 ${fIdx + 1} ("${f}") 렌더링 중 KaTeX 에러 발생!`);
        katexErrorOccurred = true;
      } else {
        console.log(`  ✓ 수식 ${fIdx + 1} ("${f}") KaTeX 정상 렌더링 완료`);
      }
    } catch (e) {
      console.error(`❌ [KaTeX Exception] 수식 ${fIdx + 1} ("${f}"):`, e.message);
      katexErrorOccurred = true;
    }
  });

  if (!katexErrorOccurred) {
    console.log(`✅ 테스트 [${idx + 1}] 성공: 파편화 없음 & KaTeX 렌더링 100% 정상`);
    totalPassed++;
  } else {
    totalFailed++;
  }
});

console.log("\n=================================================");
console.log(`📊 최종 테스트 결과: 전체 ${testCases.length}건 중 성공 ${totalPassed}건 / 실패 ${totalFailed}건`);
console.log("=================================================");

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
