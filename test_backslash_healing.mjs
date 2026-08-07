import { healLatexFormulas, healBackslashes, tokenizeForHealing } from './server/utils/latexUtils.js';

const input = "과잉간극수압 소산 및 유효응력 증가(σ'₩증가)를 반영하지 못함";
console.log("Output:", healLatexFormulas(input));
