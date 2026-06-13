import { healLatexFormulas } from '../server/utils/latexUtils.js';

const testCase1 = `이것은 본문입니다. margin-bottom: 10px; 이나 padding-left: 20px; 같은 스타일 속성은 수식으로 감싸지 않아야 합니다.`;
const testCase2 = `이것은 진짜 수식입니다. k_x / k_z = 2.0 와 y_c = 1.2 x_0 는 수식으로 감싸야 합니다.`;

console.log("=== TEST CASE 1 (CSS properties) ===");
const healed1 = healLatexFormulas(testCase1);
console.log("HEALED 1:", healed1);
console.log("HAS WRAPPED MARGIN:", healed1.includes('$margin') || healed1.includes('$padding'));

console.log("\n=== TEST CASE 2 (Actual Math) ===");
const healed2 = healLatexFormulas(testCase2);
console.log("HEALED 2:", healed2);
console.log("HAS WRAPPED MATH:", healed2.includes('$k_x') && healed2.includes('$y_c'));
