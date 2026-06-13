import { healLatexFormulas } from '../server/utils/latexUtils.js';

// 실제 스크린샷에서 보이는 깨진 입력 재현
const testCases = [
  // 빈 spacer div + 내용 div 복합 케이스
  {
    name: "Empty spacer div + content div",
    input: `*Q : 단위폭당침투유량*k: 흙의투수계수*H  상 하류 측의 전수두차<div style="height: 0.8rem;"></div><div style="margin-top: 0.6rem; margin-bottom: 0.6rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">*N_f: 유로의 수</div><div style="margin-top: 0.6rem; margin-bottom: 0.6rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">*N_d$: 등수두선 낙차 수</div>`
  },
  // dfrac 공백 케이스
  {
    name: "dfrac with space inside brace",
    input: "$K_0 = \\dfrac{ u}{1 - u}$"
  },
  // 정상 케이스
  {
    name: "Normal K0 formula",
    input: "공식 $K_0 = \\dfrac{u}{1-u}$"
  }
];

testCases.forEach(tc => {
  console.log(`\n=== ${tc.name} ===`);
  console.log(`Input:  ${tc.input.substring(0, 120)}`);
  console.log(`Output: ${healLatexFormulas(tc.input).substring(0, 300)}`);
});
