// test_healer.js
import { tokenizeForHealing, healLatexFormulas } from '../server/utils/latexUtils.js';

function healBackslashes(str, isMathMode = false) {
  if (!str) return str;
  let healed = str;

  // 1. Handle log and ln specifically to support logp, logt, log_10, lnp, lnt, etc.
  if (isMathMode) {
    healed = healed.replace(/(?<!\\)\blog\b/g, '\\log');
    healed = healed.replace(/(?<!\\)\bln\b/g, '\\ln');
    healed = healed.replace(/(?<!\\)\blog(?=[pt_0-9])/g, '\\log ');
    healed = healed.replace(/(?<!\\)\bln(?=[pt_0-9])/g, '\\ln ');
  } else {
    healed = healed.replace(/(?<!\\)\blog\b/g, '\\log');
    healed = healed.replace(/(?<!\\)\bln\b/g, '\\ln');
    healed = healed.replace(/(?<!\\)\blog(?=[pt_0-9\(\s])/g, '\\log');
    healed = healed.replace(/(?<!\\)\bln(?=[pt_0-9\(\s])/g, '\\ln');
  }

  // 2. Define symbols/keywords to heal
  const greekSymbols = [
    'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
    'zeta', 'xi', 'chi', 'upsilon'
  ];

  const safeMathCommands = [
    'frac', 'sqrt', 'rightarrow', 'leftarrow', 'cdot'
  ];

  const mathModeCommands = [
    'left', 'right', 'le', 'ge', 'times', 'div', 'pm', 'infty', 'partial', 'sum', 'int', 'tan', 'sin', 'cos', 'sec', 'cosec', 'cot'
  ];

  const keywordsToHeal = isMathMode 
    ? [...greekSymbols, ...safeMathCommands, ...mathModeCommands]
    : [...greekSymbols, ...safeMathCommands];

  keywordsToHeal.forEach(kw => {
    const regex = new RegExp(`(?<!\\\\)\\b${kw}(?![a-zA-Z])`, 'g');
    healed = healed.replace(regex, `\\${kw}`);
  });

  return healed;
}

function healLatexFormulasProposed(text) {
  if (!text) return text;

  // 0. Clean up leaked JSON structures & trailing backslashes
  let healed = text.replace(/",\s*"[a-zA-Z_0-9]+"\s*:\s*"/g, '\n\n');
  healed = healed.replace(/\\+(\r?\n|$)/g, '$1');

  // 0.2. Heal missing backslashes in math/text blocks
  {
    const tokens = tokenizeForHealing(healed);
    healed = tokens.map(token => {
      let content = token.content;
      if (token.type === 'text') {
        content = healBackslashes(content, false);
      } else {
        const isBlock = content.startsWith('$$');
        const math = isBlock ? content.substring(2, content.length - 2) : content.substring(1, content.length - 1);
        const healedMath = healBackslashes(math, true);
        content = isBlock ? `$$${healedMath}$$` : `$${healedMath}$`;
      }
      return content;
    }).join('');
  }

  // Delegate the rest to the original healLatexFormulas logic to see the end-to-end result
  return healLatexFormulas(healed);
}

// Test inputs based on the screenshot
const testInputs = [
  "fracc_vtH_d^2 입니다.",
  "압밀도(U): U = 1 - fracu_tu_0 로 정의되며",
  "시간이 흐름에 따라 u rightarrow0 이 되며 sigma' rightarrow Delta sigma 가 되는 과정을 그래프로 표현하는 것",
  "실내 압밀시험 결과인 e logp 곡선으로부터 구한 c_v 와 현장 지반"
];

testInputs.forEach((inp, idx) => {
  console.log(`\n--- Test ${idx + 1} ---`);
  console.log("Input: ", inp);
  console.log("Output:", healLatexFormulasProposed(inp));
});
