const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '..', 'server', 'index.js');
const serverContent = fs.readFileSync(serverFile, 'utf8');

const lines = serverContent.split('\n');
const tokenizeForHealingCode = lines.slice(5499, 5523).join('\n');

const symbols = [
  'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
  'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
  'Phi', 'Theta', 'Omega'
];

const safeLatexCommands = [
  'frac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
  'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
  'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
  'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
  'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
  'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
  'equiv', 'nabla', 'quad', 'qquad', 'max', 'min'
];

const tempModuleFile = path.join(__dirname, 'temp_healer_module.js');
const runCode = `
${tokenizeForHealingCode}
module.exports = { tokenizeForHealing };
`;
fs.writeFileSync(tempModuleFile, runCode);
const { tokenizeForHealing } = require(tempModuleFile);
fs.unlinkSync(tempModuleFile);

function logFocused(stage, text) {
  console.log(`\n=== [${stage}] ===`);
  const lines = text.split('\n');
  const formulaIndex = lines.findIndex(l => l.includes('B(') || l.includes('지배방정식') || /[\$\\]/.test(l));
  if (formulaIndex !== -1) {
    const start = Math.max(0, formulaIndex - 1);
    const end = Math.min(lines.length, formulaIndex + 4);
    console.log(lines.slice(start, end).join('\n'));
  } else {
    console.log(text.substring(0, 300));
  }
}

function newHealLatexFormulas(text) {
  if (text) {
    text = text.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
      if (safeLatexCommands.includes(p1)) return '\\' + p1;
      return match;
    });
  }
  if (!text) return text;

  const missingLeadingRegex = new RegExp(
    `(?<!\\$)\\\\(?:${symbols.join('|')}|nabla|partial)(?:_(?:[a-zA-Z0-9]+|\\{[a-zA-Z0-9_]+\\}))?(?:')?\\$`,
    'g'
  );
  text = text.replace(missingLeadingRegex, (match) => `$${match}`);
  logFocused('After Rule A', text);

  const missingTrailingRegex = new RegExp(
    `\\$(?:\\\\(?:${symbols.join('|')}|nabla|partial)(?:_(?:[a-zA-Z0-9]+|\\{[a-zA-Z0-9_]+\\}))?(?:')?)(?![a-zA-Z0-9_$])`,
    'g'
  );
  text = text.replace(missingTrailingRegex, (match) => `${match}$`);
  logFocused('After Rule B', text);

  const fileLines = text.split('\n');
  const processedLines = fileLines.map(line => {
    let trimmed = line.trim();
    if (!trimmed) return line;

    const formulaSplitRegex = /^([^\uAC00-\uD7A3]*\$)\s*([^\uAC00-\uD7A3]*[\uAC00-\uD7A3].*)$/;
    const splitMatch = trimmed.match(formulaSplitRegex);
    if (splitMatch) {
      let mathPart = splitMatch[1];
      const descPart = splitMatch[2];
      const hasMathIndicators = /\\(sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|Delta|omega|mu|lambda|psi|rho|eta|frac|sqrt|cdot|mathrm|text|log|Sigma|Gamma|Phi|Theta|Omega)\b/.test(mathPart) || 
                                /[_^{<>=]/.test(mathPart);
      if (hasMathIndicators) {
        mathPart = mathPart.replace(/\$/g, '').trim();
        return `\$${mathPart}\$ ${descPart}`;
      }
    }

    const hasMathIndicators = /\\(sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|Delta|omega|mu|lambda|psi|rho|eta|frac|sqrt|cdot|mathrm|text|log|Sigma|Gamma|Phi|Theta|Omega)\b/.test(trimmed) || 
                              /[_^{<>=]/.test(trimmed);
    const hasKorean = /[\uAC00-\uD7A3]/.test(trimmed);
    const isHeader = trimmed.startsWith('#');

    if (hasMathIndicators && !hasKorean && !isHeader) {
      const cleaned = trimmed.replace(/\$/g, '').trim();
      return `$${cleaned}$`;
    }

    return line;
  });
  text = processedLines.join('\n');
  logFocused('After Rule C', text);

  text = text.replace(/\$([가-힣\s,\.\?\!\(\)\[\]]+?)\$/g, '$1');
  text = text.replace(/\$([a-zA-Z_\\][a-zA-Z0-9_{}\\']*(?:_\{?[a-zA-Z0-9_]+\}?)?)\s+([가-힣][^$]*?)\$/g,
    (match, mathPart, koreanPart) => `$${mathPart.trim()}$ ${koreanPart}`
  );
  text = text.replace(/\$([가-힣][^$]*?)\s+([a-zA-Z_\\][a-zA-Z0-9_{}\\']*(?:_\{?[a-zA-Z0-9_]+\}?)?)\$/g,
    (match, koreanPart, mathPart) => `${koreanPart} $${mathPart.trim()}$`
  );
  text = text.replace(/\\text\{\s*([가-힣\s0-9배차]+)\s*\}/g, ' $1 ');
  text = text.replace(/\$([0-9.,\-\+]+)\s*([가-힣a-zA-Z%]+)\$/g, '$1$2');

  {
    const preToks = tokenizeForHealing(text);
    text = preToks.map(tok => {
      if (tok.type !== 'text') return tok.content;
      return tok.content.replace(
        /\(\s*(\\(?:sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|Delta|Sigma|Gamma|Phi|Theta|Omega|nabla|partial)(?:_(?:[a-zA-Z0-9]+|\{[a-zA-Z0-9_]+\}))?(?:')?\s*)\)/g,
        (match, cmd) => `($${cmd.trim()}$)`
      );
    }).join('');
  }

  let trimmed = text.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    trimmed = trimmed.substring(2, trimmed.length - 2).trim();
  } else if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }

  const hasMathIndicators = /\\(sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|Delta|omega|mu|lambda|psi|rho|eta|frac|sqrt|cdot|mathrm|text|log|Sigma|Gamma|Phi|Theta|Omega)\b/.test(trimmed) || 
                            /[_^{<>=]/.test(trimmed);
  const hasKorean = /[\uAC00-\uD7A3]/.test(trimmed);
  
  let healed = text;
  if (hasKorean && ((text.trim().startsWith('$$') && text.trim().endsWith('$$')) || (text.trim().startsWith('$') && text.trim().endsWith('$')))) {
    healed = trimmed;
  }

  const linesAfter = healed.split('\n');
  const processedLinesAfter = linesAfter.map(line => {
    const dollarCount = (line.match(/\$/g) || []).length;
    const isFormulaLine = /^[\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}()\[\],.\\\/]*?[<>=]+/.test(line);
    if (dollarCount === 1 && isFormulaLine) {
      return line.replace(/\$/g, '');
    }
    return line;
  });
  healed = processedLinesAfter.join('\n');
  logFocused('Before Old Syntax Clean', healed);

  healed = healed.replace(/(\r?\n|^)(\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}()\[\],.\\\/]*?)\$([^$\n]*?)\$/g, (match, start, p1, p2) => {
    const hasBackslash = p1.includes('\\') || p2.includes('\\');
    const hasGreek = symbols.some(sym => p1.includes(sym) || p2.includes(sym));
    if (hasBackslash || hasGreek) {
      return start + '$' + p1 + p2 + '$';
    }
    return match;
  });
  logFocused('After Old Syntax Clean', healed);

  healed = healed.replace(/\\frac\s*\{\s*\$([^\$]+?)\}/g, '\\frac{$1}');
  healed = healed.replace(/\{\s*\$([^\$]+?)\s*\}/g, '{$1}');
  healed = healed.replace(/(\d+)\s*\$\s*([\/+\-*])\s*(\d+)/g, '$1$2$3');

  {
    const rule5Tokens = tokenizeForHealing(healed);
    healed = rule5Tokens.map(tok => {
      if (tok.type !== 'text') return tok.content;
      return tok.content.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
    }).join('');
  }
  logFocused('Before STEP 1', healed);

  let tokens = tokenizeForHealing(healed);
  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      const formulaPattern = /((?:\\?[a-zA-Z_0-9']+(?:_[a-zA-Z0-9{}]+)?\s*[<>=]+\s*[a-zA-Z0-9_'\s\-+\/{}()\[\],.\\\/<>:;!?^~&|%]*[a-zA-Z0-9')\}]))/g;
      t = t.replace(formulaPattern, (match, g1) => {
        if (g1) {
          const hasBackslash = g1.includes('\\');
          const hasGreek = symbols.some(sym => g1.includes(sym));
          const hasMathContext = /[<>=]/.test(g1) && (hasBackslash || hasGreek || /\b[cuq]\b/.test(g1));
          if (hasBackslash || hasGreek || hasMathContext) {
            const isComplex = g1.includes('\\frac') || g1.includes('\\log') || g1.length > 40;
            return isComplex ? `$$${g1.trim()}$$` : `$${g1.trim()}$`;
          }
        }
        return match;
      });

      t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
      t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*u)/g, (match, p1) => '$' + p1 + '$');
      t = t.replace(/(\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');

      token.content = t;
    }
  });

  let reassembledAfterStep1 = tokens.map(t => t.content).join('');
  logFocused('After STEP 1', reassembledAfterStep1);
  tokens = tokenizeForHealing(reassembledAfterStep1);

  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      t = t.replace(/\(([^)$]*?(?:\\gamma|\\sigma|\\theta|\\phi|\\alpha|\\beta|\\frac|\\delta|\\Delta|_[a-zA-Z0-9{])[^)$]*?)\)/g, (match, p1) => {
        if (p1.includes('\\left') || p1.includes('\\right')) {
          return match;
        }
        return '($' + p1.trim() + '$)';
      });
      token.content = t;
    }
  });

  // STEP 2: 그리스 변수와 첨자 감싸기
  let reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);

  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      const wrapAllowedWords = [
        'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'
      ];
      const subscriptPat = `(?:_[a-zA-Z0-9]+|_(?:\\{[a-zA-Z0-9_]+\\}))?`;
      const greekPattern = new RegExp(`(\\\\\\b(${wrapAllowedWords.join('|')})${subscriptPat}(?![a-zA-Z0-9_]))`, 'g');
      t = t.replace(greekPattern, (match, p1) => '$' + p1 + '$');

      const plainSubscriptPattern = /((\b[a-zA-Z](?:_[a-zA-Z0-9]+|_(?:\{[a-zA-Z0-9_]+\}))(?![a-zA-Z0-9_])))/g;
      t = t.replace(plainSubscriptPattern, (match, p1) => '$' + p1 + '$');

      token.content = t;
    }
  });

  // STEP 3: 수식 블록 내부 포맷 정리
  reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);

  tokens.forEach(token => {
    if (token.type !== 'text') {
      let inside = token.content;
      const isBlock = inside.startsWith('$$');
      let math = isBlock 
        ? inside.substring(2, inside.length - 2).trim()
        : inside.substring(1, inside.length - 1).trim();

      math = math.replace(/\by_([a-zA-Z0-9]+)\b/g, '\\gamma_$1');
      math = math.replace(/\by\s*D_f\b/g, '\\gamma D_f');
      math = math.replace(/\byD_f\b/g, '\\gamma D_f');
      math = math.replace(/\by\s*\\?cdot\b/g, '\\gamma \\cdot');

      math = math.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
        if (safeLatexCommands.includes(p1)) return '\\' + p1;
        return match;
      });

      token.content = isBlock ? `$$${math}$$` : `$${math}$`;
    }
  });

  reassembled = tokens.map(t => t.content).join('');
  const finalTokens = tokenizeForHealing(reassembled);

  finalTokens.forEach(token => {
    if (token.type === 'inline-math') {
      const inside = token.content.substring(1, token.content.length - 1).trim();
      token.content = `$${inside}$`;
    } else if (token.type === 'block-math') {
      const inside = token.content.substring(2, token.content.length - 2).trim();
      token.content = `$$${inside}$$`;
    }
  });

  reassembled = finalTokens.map(t => t.content).join('');
  reassembled = reassembled.replace(/([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])([\(\[\{])/g, '$1 $2');
  reassembled = reassembled.replace(/([\)\]\}])([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])/g, '$1 $2');

  const processedTokens = tokenizeForHealing(reassembled);
  let result = '';
  for (let i = 0; i < processedTokens.length; i++) {
    const current = processedTokens[i];
    if (i === 0) {
      result += current.content;
      continue;
    }

    const prev = processedTokens[i - 1];
    let needSpace = false;

    if (prev.type === 'text' && (current.type === 'inline-math' || current.type === 'block-math')) {
      const lastChar = prev.content[prev.content.length - 1];
      if (lastChar && !/\s/.test(lastChar)) {
        if (!/[\(\[\{\'\"]/.test(lastChar)) {
          needSpace = true;
        }
      }
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && current.type === 'text') {
      const firstChar = current.content[0];
      if (firstChar && !/\s/.test(firstChar)) {
        if (!/[\,\.\?\!\)\]\}\:\;\*]/.test(firstChar)) {
          needSpace = true;
        }
      }
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && (current.type === 'inline-math' || current.type === 'block-math')) {
      needSpace = true;
    }

    if (needSpace) {
      result += ' ' + current.content;
    } else {
      result += current.content;
    }
  }

  return result;
}

// Test inputs
const testInput1 = `* **물리적 기전**: 지반의 내부마찰각 (
ϕ
ϕ) 이 클수록 흙 입자 간의 전단 저항력이 커지며, 이는 하중을 주변 지반으로 전이 (Stress Transfer) 시키는 능력을 강화합니다. 따라서 $\\phi 가 증가할수록 주변으로 전이되는 응력은 커지고, 결과적으로 하부의 잔류 연직 응력 (\\sigma_v$) 은 지수함수적으로 감소하게 됩니다.
### 2. 테르자기의 연직 응력 지배방정식
테르자기는 폭 B 인 트랩도어 상부의 연직 응력 (\\sigma_v) 을 다음과 같은 비선형 미분방정식의 해로 제시하였습니다.
\\sigma_v$ = \\frac{B(\\gamma$ - \\frac{c}{B})}{K \\tan $\\phi$} (1 - e^{-K \\tan $\\phi$ \\frac{z}{B}}) + q e^{-K \\tan $\\phi$ \\frac{z}{B}}$**[변수 설명]***
\\sigma_v$: 깊이 z 에서의 연직 응력
* \\gamma: 흙의 단위중량
* c: 흙의 점착력
* B: 이완 영역 of폭 (트랩도어 폭)
* K: 토압계수 (수평/연직 응력비)
*
\\phi$: 흙의 내부마찰각* q: 지표면 상`;

console.log("=== HEALED OUTPUT ===");
console.log(newHealLatexFormulas(testInput1));

console.log("\n=== HEALED TOKENS ===");
console.log(tokenizeForHealing(newHealLatexFormulas(testInput1)));
