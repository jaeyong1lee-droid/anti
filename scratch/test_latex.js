const texts = [
  "철근 자체의 열팽창 계수(\\\\alpha_{steel})는",
  "콘크리트 라이닝 휨 압축 강도(f_{ck})는",
  "락볼트 부식 전기 화학적 속도(i_{cor})는",
  "최대 하중(P_{max})을 측정하여",
  "한글$수식$한글",
  "한글 $수식$ 한글",
  "계수 $ \\alpha $ 는" // Test Rule 1: 내부 공백 제거
];

const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta'];

function healLatexFormulas(text) {
  if (!text) return text;
  
  let healed = text;

  // 1. Replace multiple backslashes with a single backslash
  healed = healed.replace(/\\+/g, '\\');

  // 2. Wrap bare Greek letters with backslashes
  symbols.forEach(sym => {
    const regex = new RegExp(`(?<!\\\\)\\b${sym}\\b`, 'g');
    healed = healed.replace(regex, `\\${sym}`);
  });

  // 3. Wrap specific arithmetic equations like \sigma' = \sigma - P_w
  healed = healed.replace(/(?:\$[^\$]+\$)|(\\sigma'\s*=\s*\\sigma\s*-\s*P_w)/g, (match, g1) => g1 ? `$${g1}$` : match);
  healed = healed.replace(/(?:\$[^\$]+\$)|(\\sigma'\s*=\s*\\sigma\s*-\s*u)/g, (match, g1) => g1 ? `$${g1}$` : match);
  healed = healed.replace(/(?:\$[^\$]+\$)|(\\sigma\s*-\s*P_w)/g, (match, g1) => g1 ? `$${g1}$` : match);

  // 4. Match and wrap comparison/equality formulas containing greek letters or backslashes
  const formulaPattern = /(?:\$[^\$]+\$)|((?:\\?[a-zA-Z_0-9']+(?:_[a-zA-Z0-9]+)?(?:\s*[-+*\/]*\s*[<>=]+\s*[-+*\/]*\s*\\?[a-zA-Z_0-9']+(?:_[a-zA-Z0-9]+)?)+))/g;
  
  healed = healed.replace(formulaPattern, (match, g1) => {
    if (g1) {
      const hasBackslash = g1.includes('\\');
      const hasGreek = symbols.some(sym => g1.includes(sym));
      const hasMathContext = /[<>=]/.test(g1) && (hasBackslash || hasGreek || /\b[cuq]\b/.test(g1));
      if (hasBackslash || hasGreek || hasMathContext) {
        return `$${g1.trim()}$`;
      }
      return g1;
    }
    return match;
  });

  // 5. Wrap individual Greek variables like \alpha_p, \alpha_f, \phi, including curly brace subscripts like \tau_{allow}
  const subscriptPattern = `(?:_[a-zA-Z0-9]+|_(?:\\{[a-zA-Z0-9_]+\\}))?`;
  const greekPattern = new RegExp(`(?:\\$[^\$]+\\$)|((\\\\\\b(?:${symbols.join('|')})${subscriptPattern}(?![a-zA-Z0-9_])))`, 'g');
  
  healed = healed.replace(greekPattern, (match, g1) => {
    if (g1) {
      return `$${g1}$`;
    }
    return match;
  });

  // 6. Wrap plain variable subscripts (like f_{ck}, i_{cor}, P_{max}, P_w) that don't have backslashes
  const plainSubscriptPattern = /(?:\$[^\$]+\$)|((\b[a-zA-Z](?:_[a-zA-Z0-9]+|_(?:\{[a-zA-Z0-9_]+\}))(?![a-zA-Z0-9_])))/g;
  healed = healed.replace(plainSubscriptPattern, (match, g1) => {
    if (g1) {
      return `$${g1}$`;
    }
    return match;
  });

  // 7. Enforce LaTeX Rules:
  // Rule 1: 내부 공백 절대 금지 (Remove spaces inside $ and contents)
  // Let's strip spaces adjacent to the opening and closing $
  healed = healed.replace(/\$\s+([^\$]+?)\s+\$/g, '$$$1$');
  healed = healed.replace(/\$\s+([^\$]+?)\$/g, '$$$1$');
  healed = healed.replace(/\$([^\$]+?)\s+\$/g, '$$$1$');

  // Rule 2: 외부 공백 필수 (Ensure exactly one space before and after the math blocks if not already separated)
  // We can do this dynamically by locating each $...$ block
  let tempHealed = healed;
  const mathBlockPattern = /\$([^\$]+?)\$/g;
  let offsetShift = 0;
  
  healed = healed.replace(mathBlockPattern, (match, formula, offset, originalString) => {
    let result = match;
    
    // Check character before opening $
    const charBeforeIndex = offset - 1;
    if (charBeforeIndex >= 0) {
      const charBefore = originalString[charBeforeIndex];
      if (charBefore !== ' ' && charBefore !== '$' && charBefore !== '\n') {
        result = ' ' + result;
      }
    }
    
    // Check character after closing $
    const charAfterIndex = offset + match.length;
    if (charAfterIndex < originalString.length) {
      const charAfter = originalString[charAfterIndex];
      if (charAfter !== ' ' && charAfter !== '$' && charAfter !== '\n') {
        result = result + ' ';
      }
    }
    
    return result;
  });

  return healed;
}

texts.forEach((t, i) => {
  console.log(`\n--- Test ${i+1} ---`);
  console.log("Original:", t);
  console.log("Healed:  ", healLatexFormulas(t));
});
