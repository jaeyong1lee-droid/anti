import { healLatexFormulas } from '../client/src/utils/latexUtils.js';

function isMathVariable(str) {
  if (/^[a-zA-Z0-9]$/.test(str)) return true;
  if (/[\\_^]/.test(str)) return true;
  if (str.startsWith('\\')) return true;
  return false;
}

function testHealLatexFormulas(text) {
  if (!text || typeof text !== 'string') return text;

  let processed = text;
  
  // 1. Newline corrupted
  processed = processed.replace(/\n\s*eq\b/g, '\\neq');
  
  // 2. Space corrupted or squished (using \s*)
  processed = processed.replace(/\b([a-zA-Z0-9_\\'\^]+)\s*eq\s*([a-zA-Z0-9_\\'\^]+)\b/g, (match, p1, p2) => {
    if (isMathVariable(p1) && isMathVariable(p2)) {
      return `${p1} \\neq ${p2}`;
    }
    return match;
  });

  return healLatexFormulas(processed);
}

const testCases = [
  "이방성 투수 특성을 가진 지반 (k_x eq k_z) 에서 유선망을 작도하기 위해",
  "이방성 투수 특성을 가진 지반 (k_xeqk_z) 에서",
  "이방성 투수 특성을 가진 지반 (k_x eqk_z) 에서",
  "이방성 투수 특성을 가진 지반 (k_xeq k_z) 에서",
  "지반의 투수계수가 k_x eq k_z 인 경우",
  "\\sigma_1 eq \\sigma_3",
  "\\sigma_1eq\\sigma_3",
  "c eq 0",
  "ceq0",
  "normal text with no formula eq here", 
  "freq1", // should NOT match (fr is not a math variable)
  "seq_1", // should NOT match (s is math var, but no eq)
];

testCases.forEach((tc, idx) => {
  console.log(`--- Test ${idx + 1} ---`);
  console.log(`Input:  ${tc}`);
  console.log(`Output: ${testHealLatexFormulas(tc)}`);
});
