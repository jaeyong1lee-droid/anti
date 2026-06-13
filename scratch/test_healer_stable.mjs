import { healLatexFormulas as clientHeal } from '../client/src/utils/latexUtils.js';
import { healLatexFormulas as serverHeal } from '../server/utils/latexUtils.js';

const sampleText = `
일축 응력 상태에서 체적 변형률은
포아송비 u 의 물리적 한계는 -1 <= u <= 0.5 이다.
`;

console.log("=== Testing Stable Client Healer ===");
console.log(clientHeal(sampleText));

console.log("\n=== Testing Stable Server Healer ===");
console.log(serverHeal(sampleText));
