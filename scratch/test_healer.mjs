// test_healer.mjs
import { tokenizeForHealing, healLatexFormulas } from '../server/utils/latexUtils.js';

// Test inputs based on the screenshot
const testInputs = [
  "frac{c_v t}{H_d^2} 입니다.",
  "압밀도(U): U = 1 - frac{u_t}{u_0} 로 정의되며",
  "시간이 흐름에 따라 u rightarrow 0 이 되며 sigma' rightarrow Delta sigma 가 되는 과정을 그래프로 표현하는 것",
  "실내 압밀시험 결과인 e logp 곡선으로부터 구한 c_v 와 현장 지반",
  "침하 완료 시간을 예측합니다.* 응력 전이: 하중 재하 직후에는 모든 하중을 간극수압이 부담하나, 시간이 경과함에 따라 간극수압이 소산 (u \rightarrow 0) 되면서 유효응력 (\sigma' = \sigma - u) 이 증가하여 흙 골격의 압밀 침하가 진행됩니다.* 실무적 활용: 연약지반 개량 공법"
];

function testHeal(inp) {
  if (!inp) return inp;
  // 문장 끝의 * 기호 앞뒤에 강제 줄바꿈 삽입 (단락 구분 가독성 개선)
  let text = inp.replace(/([\.?!\)\]\}])\s*\*\s*(?=[\uAC00-\uD7A3])/g, '$1\n\n* ');
  let res = healLatexFormulas(text);
  return res;
}

testInputs.forEach((inp, idx) => {
  console.log(`\n--- Test ${idx + 1} ---`);
  console.log("Input: ", inp);
  console.log("Output:", testHeal(inp));
});
