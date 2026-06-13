import { healLatexFormulas } from '../server/utils/latexUtils.js';

const testCases = [
  "공식 c_u = 5",
  "공식 \\sigma_u = 10",
  "공식 E_u = 2000",
  "공식 u = 0.3",
  "공식 K_0 = \\dfrac{u}{1-u}",
  "공식 \\sigma' = \\sigma - u",
  "간극수압(u)이 상승하여 유효응력(\\sigma' = \\sigma - u)이 감소",
  "흙의 전단 강도 \\tau_f = c' + (\\sigma - u) \\tan\\phi'"
];

console.log("Current server/utils/latexUtils.js outputs:");
testCases.forEach(tc => {
  console.log(`Input:  ${tc}`);
  console.log(`Output: ${healLatexFormulas(tc)}`);
  console.log("-----------------------------------");
});
