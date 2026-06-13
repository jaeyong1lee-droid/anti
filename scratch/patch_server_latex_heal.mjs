import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverIndexPath = path.resolve(__dirname, '..', 'server', 'index.js');
let content = fs.readFileSync(serverIndexPath, 'utf8');

const targetStartMarker = 'function healLatexFormulas(text) {';
const targetEndMarker = 'function healQuizQuestionObject(q)';

const startIndex = content.indexOf(targetStartMarker);
if (startIndex === -1) {
  console.error("Could not find start of healLatexFormulas in server/index.js");
  process.exit(1);
}

const endIndex = content.indexOf(targetEndMarker, startIndex);
if (endIndex === -1) {
  console.error("Could not find end of healLatexFormulas in server/index.js");
  process.exit(1);
}

const before = content.substring(0, startIndex);
const after = content.substring(endIndex);

const newFunctionCode = `function healLatexFormulas(text) {
  if (!text) return text;

  // ── [치명적 오류 해결] K0, K_0, k0 관련 문자열 깨짐 및 달러 기호 꼬임 방지 선제 조치 ──
  text = text.replace(/\\$현장의\\$K_0\\$응력\\$/g, '현장의 $K_0$ 응력');
  text = text.replace(/\\$현장의\\$K_0\\$/g, '현장의 $K_0$');
  text = text.replace(/K_0응력/g, '$K_0$ 응력');
  text = text.replace(/([가-힣])([Kk]0|[Kk]_0)/g, '$1 $2');
  text = text.replace(/([Kk]0|[Kk]_0)([가-힣])/g, '$1 $2');

  const safeLatexCommands = [
    'frac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
    'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
    'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
    'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
    'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
    'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
    'equiv', 'nabla', 'quad', 'qquad', 'max', 'min'
  ];
  if (text) {
    text = text.replace(/\\\\\\\\([a-zA-Z]+)/g, (match, p1) => {
      if (safeLatexCommands.includes(p1)) return '\\\\' + p1;
      return match;
    });

    text = text.replace(/\\\\text\\{\\s*([가-힣]+)\\s*\\}/g, ' $1 ');
    text = text.replace(/\\$([0-9.,]+)([가-힣]+)\\$/g, '$1$2');
    text = text.replace(/\\$([0-9.,]+)\\s+([가-힣]+)\\$/g, '$1 $2');
    text = text.replace(/([가-힣:])(\\\\[a-zA-Z]+)/g, '$1 $2');
    text = text.replace(/([a-zA-Z0-9_])\\$(\\})/g, '$1$2$');
    text = text.replace(/\\$(\\})/g, '$1$');
  }
  if (!text) return text;
  
  text = text.replace(/\\$([가-힣]{1,10})\\$/g, '$1');

  // Strip outer dollars containing Korean text to prevent mismatched groups
  text = text.replace(/\\$\\$([^$]+?)\\$\\$/g, (match, content) => {
    if (/[\\uAC00-\\uD7A3]/.test(content)) return content;
    return match;
  });
  text = text.replace(/\\$([^$]+?)\\$/g, (match, content) => {
    if (/[\\uAC00-\\uD7A3]/.test(content)) return content;
    return match;
  });
  
  let trimmed = text.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    trimmed = trimmed.substring(2, trimmed.length - 2).trim();
  } else if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }

  const hasMathIndicators = /\\\\(sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|Delta|omega|mu|lambda|psi|rho|eta|frac|sqrt|cdot|mathrm|text|log|Sigma|Gamma|Phi|Theta|Omega)\\b/.test(trimmed) || 
                            /[_^{<>=]/.test(trimmed);
  const hasKorean = /[\\uAC00-\\uD7A3]/.test(trimmed);

  if (hasMathIndicators && !hasKorean && trimmed.length < 150) {
    const cleanedMath = trimmed.replace(/\\$/g, '');
    return \`$\${cleanedMath}$\`;
  }
  
  const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'];
  let healed = text;
  if (hasKorean && ((text.trim().startsWith('$$') && text.trim().endsWith('$$')) || (text.trim().startsWith('$') && text.trim().endsWith('$')))) {
    healed = trimmed;
  }

  const lines = healed.split('\\n');
  const processedLines = lines.map(line => {
    const dollarCount = (line.match(/\\$/g) || []).length;
    const isFormulaLine = /^[\\\\?[a-zA-Z_']+[a-zA-Z0-9_'\\s=\\-+\\*\\/{}\\(\\)\\[\\],.\\\\\\\\/]*?[<>=]+/.test(line);
    if (dollarCount === 1) {
      if (isFormulaLine) {
        return line.replace(/\\$/g, '');
      }
    }
    return line;
  });
  healed = processedLines.join('\\n');

  healed = healed.replace(/(\\r?\\n|^)(\\\\?[a-zA-Z_']+[a-zA-Z0-9_'\\s=\\-+\\*\\/{}\\(\\)\\[\\],.\\\\\\\\/]*?)\\$([^$\\n]*?)\\$/g, (match, start, p1, p2) => {
    const hasBackslash = p1.includes('\\\\') || p2.includes('\\\\');
    const hasGreek = symbols.some(sym => p1.includes(sym) || p2.includes(sym));
    if (hasBackslash || hasGreek) {
      return start + '$' + p1 + p2 + '$';
    }
    return match;
  });

  healed = healed.replace(/\\\\frac\\s*\\{\\s*\\$([^\\$]+?)\\}/g, '\\\\frac{$1}');
  healed = healed.replace(/\\{\\s*\\$([^\\$]+?)\\s*\\}/g, '{$1}');
  healed = healed.replace(/(\\d+)\\s*\\$\\s*([\\/+\\-*])\\s*(\\d+)/g, '$1$2$3');

  {
    const rule5Tokens = tokenizeForHealing(healed);
    healed = rule5Tokens.map(tok => {
      if (tok.type !== 'text') return tok.content;
      return tok.content.replace(/\\\\\\\\([a-zA-Z]+)/g, '\\\\$1');
    }).join('');
  }

  // STEP 1: Wrap larger formulas (equations containing =, <, >)
  const formulaPattern = /((?:[\\\\a-zA-Z0-9_\\-\\+\\(\\{\\[\\'][a-zA-Z_0-9\\'\\{\\}\\[\\]\\(\\)\\+\\-\\*\\/\\.\\\\\\\\/ Contrast\\t\\^]*(?:_[a-zA-Z0-9{}]+)?[ \\t]*[<>=]+[ \\t]*[a-zA-Z0-9\\'_ \\t\\-+\\/\\{\\}\\(\\)\\[\\],\\.\\\\\\\\/<>=:;!?^~&|%]*[a-zA-Z0-9\\'\\)\\}]))/g;
  let tokens = tokenizeForHealing(healed);
  tokens.forEach(tok => {
    if (tok.type === 'text') {
      tok.content = tok.content.replace(formulaPattern, (match, g1) => {
        const hasBackslash = g1.includes('\\\\');
        const hasGreek = symbols.some(sym => g1.includes(sym));
        const hasMathContext = /[<>=]/.test(g1) && (hasBackslash || hasGreek || /\\b[cuq]\\b/.test(g1));
        if (hasBackslash || hasGreek || hasMathContext) {
          let content = g1.trim();
          if (content.endsWith('\\\\')) content = content.slice(0, -1).trim();
          const isComplex = content.includes('\\\\frac') || content.includes('\\\\log') || content.length > 40;
          return isComplex ? '$$' + content + '$$' : '$' + content + '$';
        }
        return match;
      });
      tok.content = tok.content.replace(/(\\\\sigma'\\s*=\\s*\\\\sigma\\s*-\\s*P_w)/g, (match, p1) => '$' + p1 + '$');
      tok.content = tok.content.replace(/(\\\\sigma'\\s*=\\s*\\\\sigma\\s*-\\s*u)/g, (match, p1) => '$' + p1 + '$');
      tok.content = tok.content.replace(/(\\\\sigma\\s*-\\s*P_w)/g, (match, p1) => '$' + p1 + '$');
    }
  });
  healed = tokens.map(t => t.content).join('');

  // STEP 2: Re-tokenize and wrap backslash math expressions (even without =, <, >)
  const mathExprPattern = /((?:\\b[a-zA-Z0-9_\\-\\+\\*\\/\\(\\)\\[\\] \\t=<>]*)?\\\\[a-zA-Z_]+(?:[a-zA-Z0-9_\\-\\+\\*\\/\\(\\)\\[\\|\\ ']|[ \\t=<>\\\\\\\\\\^]|\\{[^}]*\\})*)/g;
  tokens = tokenizeForHealing(healed);
  tokens.forEach(tok => {
    if (tok.type === 'text') {
      tok.content = tok.content.replace(mathExprPattern, (match, g1) => {
        let content = g1.trim();
        if (content.endsWith('\\\\')) content = content.slice(0, -1).trim();
        const isComplex = content.includes('\\\\frac') || content.includes('\\\\partial') || content.length > 40;
        return isComplex ? '$$' + content + '$$' : '$' + content + '$';
      });
    }
  });
  healed = tokens.map(t => t.content).join('');

  // STEP 3: Re-tokenize and wrap parenthesized expressions that contain LaTeX commands/Greek variables but lack delimiters
  tokens = tokenizeForHealing(healed);
  tokens.forEach(tok => {
    if (tok.type === 'text') {
      let t = tok.content;
      t = t.replace(/\\(([^)$]*?(?:\\\\gamma|\\\\sigma|\\\\theta|\\\\phi|\\\\alpha|\\\\beta|\\\\frac|\\\\delta|\\\\Delta|_[a-zA-Z0-9{])[^)$]*?)\\)/g, (match, p1) => {
        if (p1.includes('\\\\left') || p1.includes('\\\\right')) {
          return match;
        }
        if (/[\\uAC00-\\uD7A3]/.test(p1)) {
          return match;
        }
        return '($' + p1.trim() + '$)';
      });
      tok.content = t;
    }
  });
  healed = tokens.map(t => t.content).join('');

  // STEP 4: Re-tokenize and wrap smaller Greek variables and subscripts
  tokens = tokenizeForHealing(healed);
  tokens.forEach(tok => {
    if (tok.type === 'text') {
      let t = tok.content;

      const mathWords = [
        'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
        'frac', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 'tan', 'approx', 'partial'
      ];
      mathWords.forEach(word => {
        const regex = new RegExp(\`(?<!\\\\\\\\)\\\\b\${word}\\\\b\`, 'g');
        t = t.replace(regex, \`\\\\\${word}\`);
      });

      const wrapAllowedWords = [
        'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'
      ];
      const subscriptPattern = \`(?:_[a-zA-Z0-9]+|_(?:\\\\{[a-zA-Z0-9_]+\\\\}))?\`;
      const greekPattern = new RegExp(\`(\\\\\\\\\\\\b(?:\${wrapAllowedWords.join('|')})\${subscriptPattern}(?![a-zA-Z0-9_]))\`, 'g');
      t = t.replace(greekPattern, (match, p1) => '$' + p1 + '$');

      const plainSubscriptPattern = /((\\b[a-zA-Z](?:_[a-zA-Z0-9]+|_(?:\\{[a-zA-Z0-9_]+\\}))(?![a-zA-Z0-9_])))/g;
      t = t.replace(plainSubscriptPattern, (match, p1) => '$' + p1 + '$');

      tok.content = t;
    }
  });
  healed = tokens.map(t => t.content).join('');

  // STEP 5: Re-tokenize and perform inner math block formatting
  tokens = tokenizeForHealing(healed);
  tokens.forEach(tok => {
    if (tok.type !== 'text') {
      let inside = tok.content;
      const isBlock = inside.startsWith('$$');
      let math = isBlock 
        ? inside.substring(2, inside.length - 2).trim()
        : inside.substring(1, inside.length - 1).trim();

      math = math.replace(/\\by_([a-zA-Z0-9]+)\\b/g, '\\\\gamma_$1');
      math = math.replace(/\\by\\s*D_f\\b/g, '\\\\gamma D_f');
      math = math.replace(/\\byD_f\\b/g, '\\\\gamma D_f');
      math = math.replace(/\\by\\s*\\\\?cdot\\b/g, '\\\\gamma \\\\cdot');

      const safeLatexCommands = [
        'frac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
        'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
        'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
        'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
        'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
        'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
        'equiv', 'nabla', 'quad', 'qquad', 'max', 'min'
      ];
      math = math.replace(/\\\\\\\\([a-zA-Z]+)/g, (match, p1) => {
        if (safeLatexCommands.includes(p1)) return '\\\\' + p1;
        return match;
      });

      tok.content = isBlock ? \`\$\$\${math}\$\$\` : \`\$\$\${math}\$\`;
    }
  });
  healed = tokens.map(t => t.content).join('');

  // STEP 6: Final spacing and redundancy formatting
  const finalTokens = tokenizeForHealing(healed);
  finalTokens.forEach(token => {
    if (token.type === 'inline-math') {
      let inside = token.content.substring(1, token.content.length - 1).trim();
      inside = inside.replace(/\\r?\\n/g, ' ').trim();
      token.content = \`\$\${inside}\$\`;
    } else if (token.type === 'block-math') {
      const inside = token.content.substring(2, token.content.length - 2).trim();
      token.content = \`\$\$\$\${inside}\$\$\`;
    }
  });

  healed = finalTokens.map(t => t.content).join('');
  healed = healed.replace(/([\\uAC00-\\uD7A3\\u1100-\\u11FF\\u3130-\\u318F0-9])([\\(\\[\\{])/g, '$1 $2');
  healed = healed.replace(/([\\)\\]\\}])([\\uAC00-\\uD7A3\\u1100-\\u11FF\\u3130-\\u318F0-9])/g, '$1 $2');

  const processedTokens = tokenizeForHealing(healed);
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
      if (lastChar && !/\\s/.test(lastChar)) {
        if (!/[\\(\\['\\"]/.test(lastChar)) {
          needSpace = true;
        }
      }
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && current.type === 'text') {
      const firstChar = current.content[0];
      if (firstChar && !/\\s/.test(firstChar)) {
        if (!/[\\)\\]\\}'\\"]/.test(firstChar)) {
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

  result = result.replace(/\\$\\$\\$(\\$?)/g, (match, p1) => '$$' + p1);
  result = result.replace(/\\$\\$([^\\$]+?)\\$(?!\\$)/g, (match, p1) => '$' + p1 + '$');
  result = result.replace(/(?<!\\$)\\$([^\\$]+?)\\$\\$/g, (match, p1) => '$' + p1 + '$');

  return result;
}`;

const patchedContent = before + newFunctionCode + after;
fs.writeFileSync(serverIndexPath, patchedContent, 'utf8');
console.log("Successfully patched healLatexFormulas in server/index.js");
