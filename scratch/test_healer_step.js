import { tokenizeForHealing, healBackslashes, cleanCorruptedFormula } from '../client/src/utils/latexUtils.js';

function healLatexFormulasStepByStep(text) {
  console.log("0. Original:\n", JSON.stringify(text));

  // [신규 전처리 1]
  text = text.replace(/<br\s*\/?>/gi, '\n\n');
  text = text.replace(/<div[^>]*>\s*•?\s*([^<]+?)\s*<\/div>/gi, '\n\n* $1');
  console.log("1. HTML prep:\n", JSON.stringify(text));

  // [신규 전처리 2]
  text = text.replace(/([^\n\s])\*([a-zA-Z0-9_\uAC00-\uD7A3]+:)/g, '$1\n\n* $2');
  console.log("2. Bullet space prep:\n", JSON.stringify(text));

  // [신규 전처리 3]
  text = text.replace(/([a-zA-Z0-9_]+)\$(?=:|\s|\n|$)/g, '$1');
  console.log("3. Misplaced dollar prep:\n", JSON.stringify(text));

  // Hash tags
  const commandsToConvert = [
    'frac', 'dfrac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
    'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
    'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
    'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
    'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
    'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
    'equiv', 'nabla', 'quad', 'qquad', 'max', 'min',
    'sim', 'le', 'ge', 'div', 'sec', 'cosec', 'cot', 'lt', 'gt', 'nu'
  ];
  const hashRegex = new RegExp(`#(${commandsToConvert.join('|')})\\b`, 'g');
  text = text.replace(hashRegex, '\\$1');
  console.log("4. Hashtags replaced:\n", JSON.stringify(text));

  text = cleanCorruptedFormula(text);
  console.log("5. Clean corrupted:\n", JSON.stringify(text));

  text = text.replace(/&#x27;/g, "'")
             .replace(/&quot;/g, '"')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&amp;/g, '&');
  console.log("6. Entities:\n", JSON.stringify(text));

  text = text.replace(/([\.?!\)\]\}])\s*\*\s*(?=[\uAC00-\uD7A3])/g, '$1\n\n* ');
  console.log("7. List spacing:\n", JSON.stringify(text));

  const safeLatexCommands = [
    'frac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
    'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
    'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
    'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
    'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
    'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
    'equiv', 'nabla', 'quad', 'qquad', 'max', 'min',
    'sim', 'le', 'ge', 'div', 'sec', 'cosec', 'cot', 'lt', 'gt'
  ];
  
  text = text.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
    if (safeLatexCommands.includes(p1)) return '\\' + p1;
    return match;
  });
  console.log("8. Double backslashes:\n", JSON.stringify(text));

  // Step 3
  {
    const tokens = tokenizeForHealing(text);
    text = tokens.map(token => {
      let content = token.content;
      if (token.type === 'text') {
        content = healBackslashes(content, false);
      } else {
        const isBlock = content.startsWith('$$');
        const math = isBlock ? content.substring(2, content.length - 2) : content.substring(1, content.length - 1);
        let healedMath = healBackslashes(math, true);
        
        healedMath = healedMath.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        healedMath = healedMath.replace(/\\(dfrac|frac)\s*\{\s*/g, '\\$1{')
                               .replace(/\s*\}\s*\{\s*/g, '}{')
                               .replace(/\s*\}\s*$/g, '}');
                               
        content = isBlock ? `$$${healedMath}$$` : `$${healedMath}$`;
      }
      return content;
    }).join('');
  }
  console.log("9. Tokenize & healBackslashes:\n", JSON.stringify(text));

  let trimmed = text.trim();
  const startsWithDollar = trimmed.startsWith('$');
  const endsWithDollar = trimmed.endsWith('$');
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    trimmed = trimmed.substring(2, trimmed.length - 2).trim();
  } else if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }

  const hasMathIndicators = /\\(sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|Delta|omega|mu|lambda|psi|rho|eta|frac|sqrt|cdot|mathrm|text|log|Sigma|Gamma|Phi|Theta|Omega)\b/.test(trimmed) || 
                            /[_^{<>=]/.test(trimmed);
  const hasKorean = /[\uAC00-\uD7A3]/.test(trimmed);

  if (startsWithDollar && endsWithDollar && hasMathIndicators && !hasKorean && trimmed.length < 150) {
    let cleanedMath = trimmed.replace(/\$/g, '');
    cleanedMath = cleanedMath.replace(/~/g, '\\sim ');
    cleanedMath = cleanedMath.replace(/(?<!\\)\bsim\b/gi, '\\sim');
    cleanedMath = cleanedMath.replace(/(\d+\.?\d*)\s+(\d+\.?\d*)/g, '$1 \\sim $2');
    text = `$${cleanedMath}$`;
    console.log("10. Block check matched:\n", JSON.stringify(text));
  } else {
    console.log("10. Block check skipped");
  }
  
  const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'];
  let healed = text;
  if (hasKorean && ((text.trim().startsWith('$$') && text.trim().endsWith('$$')) || (text.trim().startsWith('$') && text.trim().endsWith('$')))) {
    const isRealFormula = /\\/.test(trimmed) || /_/.test(trimmed) || /\^/.test(trimmed) || /[=+\-\*\/]/.test(trimmed) || /\\cdot/.test(trimmed);
    if (!isRealFormula) {
      healed = trimmed;
    }
  }

  const lines = healed.split('\n');
  const processedLines = lines.map(line => {
    const dollarCount = (line.match(/\$/g) || []).length;
    const isFormulaLine = /^[\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}\(\)\[\],.\\\\/]*?[<>=]+/.test(line);
    if (dollarCount === 1 && isFormulaLine) {
      return line.replace(/\$/g, '');
    }
    return line;
  });
  healed = processedLines.join('\n');
  console.log("11. Single dollar lines:\n", JSON.stringify(healed));

  healed = healed.replace(/(\r?\n|^)(\\?[a-zA-Z_']+[a-zA-Z0-9_'\-+\*\/\{\}\(\)\[\]\.\\\\/]*?)\$([^$\n]*?)\$/g, (match, start, p1, p2) => {
    const hasBackslash = p1.includes('\\') || p2.includes('\\');
    const hasGreek = symbols.some(sym => p1.includes(sym) || p2.includes(sym));
    if (hasBackslash || hasGreek) {
      return start + '$' + p1 + p2 + '$';
    }
    return match;
  });
  console.log("12. Formula prefix wrapper:\n", JSON.stringify(healed));

  healed = healed.replace(/\\frac\s*\{\s*\$([^\$]+?)\}/g, '\\frac{$1}');
  healed = healed.replace(/\{\s*\$([^\$]+?)\s*\}/g, '{$1}');
  healed = healed.replace(/(\d+)\s*\$\s*([\/+\-*])\s*(\d+)/g, '$1$2$3');
  console.log("13. Frac dollar clean:\n", JSON.stringify(healed));

  {
    const rule5Tokens = tokenizeForHealing(healed);
    healed = rule5Tokens.map(tok => {
      if (tok.type !== 'text') return tok.content;
      return tok.content.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
    }).join('');
  }
  console.log("14. Double backslashes in text:\n", JSON.stringify(healed));

  const runOnTextOnly = (txt, fn) => {
    if (!txt) return '';
    const parts = txt.split(/(<[^>]+>)/g);
    return parts.map(part => {
      if (part.startsWith('<') && part.endsWith('>')) return part;
      return fn(part);
    }).join('');
  };

  let tokens = tokenizeForHealing(healed);
  tokens.forEach(token => {
    if (token.type === 'text') {
      token.content = runOnTextOnly(token.content, (t) => {
        const formulaPattern = /([a-zA-Z0-9_\-\+\*\/()\[\]\{\} \t=<>\\.,\^·~']+)/g;
        t = t.replace(formulaPattern, (match) => {
          const trimmedMatch = match.trim();
          if (!trimmedMatch) return match;
          if (trimmedMatch.startsWith('$')) return match;
          if (/^[a-zA-Z0-9\s]+$/.test(trimmedMatch)) return match;
          
          const hasBackslash = trimmedMatch.includes('\\');
          const hasGreek = symbols.some(sym => trimmedMatch.includes(sym));
          const hasMathContext = /[=<>+\/]/.test(trimmedMatch) || /_[a-zA-Z0-9{}]/.test(trimmedMatch) || /\^/.test(trimmedMatch) || /\s-\s/.test(trimmedMatch);
          
          if (hasBackslash || hasGreek || hasMathContext) {
            const isComplex = trimmedMatch.includes('\\frac') || trimmedMatch.includes('\\log') || trimmedMatch.length > 40;
            return isComplex ? `$$${trimmedMatch}$$` : `$${trimmedMatch}$`;
          }
          return match;
        });

        t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
        t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*u)/g, (match, p1) => '$' + p1 + '$');
        t = t.replace(/(\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
        return t;
      });
    }
  });

  let reassembledAfterStep1 = tokens.map(t => t.content).join('');
  console.log("15. Complex formula wrapping:\n", JSON.stringify(reassembledAfterStep1));

  tokens = tokenizeForHealing(reassembledAfterStep1);
  tokens.forEach(token => {
    if (token.type === 'text') {
      token.content = runOnTextOnly(token.content, (t) => {
        return t.replace(/\(([^)$]*?(?:\\gamma|\\sigma|\\theta|\\phi|\\alpha|\\beta|\\frac|\\delta|\\Delta|_[a-zA-Z0-9{])[^)$]*?)\)/g, (match, p1) => {
          if (p1.includes('\\left') || p1.includes('\\right')) return match;
          return '($' + p1.trim() + '$)';
        });
      });
    }
  });

  let reassembled = tokens.map(t => t.content).join('');
  console.log("16. Parenthesized greek wrapping:\n", JSON.stringify(reassembled));

  tokens = tokenizeForHealing(reassembled);
  tokens.forEach(token => {
    if (token.type === 'text') {
      token.content = runOnTextOnly(token.content, (t) => {
        const mathWords = [
          'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
          'frac', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 'tan', 'approx', 'partial'
        ];
        mathWords.forEach(word => {
          const regex = new RegExp(`(?<!\\\\)\\b${word}\\b`, 'g');
          t = t.replace(regex, `\\${word}`);
        });

        const wrapAllowedWords = [
          'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'
        ];
        const subscriptPattern = `(?:_[a-zA-Z0-9]+|_(?:\\{[a-zA-Z0-9_]+\\}))?`;
        const greekPattern = new RegExp(`(\\\\\\b(?:${wrapAllowedWords.join('|')})${subscriptPattern}(?![a-zA-Z0-9_]))`, 'g');
        t = t.replace(greekPattern, (match, p1) => '$' + p1 + '$');

        const plainSubscriptPattern = /((\b[a-zA-Z](?:_[a-zA-Z0-9]+|_(?:\{[a-zA-Z0-9_]+\}))(?![a-zA-Z0-9_])))/g;
        t = t.replace(plainSubscriptPattern, (match, p1) => '$' + p1 + '$');
        return t;
      });
    }
  });

  reassembled = tokens.map(t => t.content).join('');
  console.log("17. Subscript and Greek wrapping:\n", JSON.stringify(reassembled));

  tokens = tokenizeForHealing(reassembled);
  tokens.forEach(token => {
    if (token.type !== 'text') {
      let inside = token.content;
      const isBlock = inside.startsWith('$$');
      let math = isBlock ? inside.substring(2, inside.length - 2).trim() : inside.substring(1, inside.length - 1).trim();
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
  console.log("18. Math token post-process:\n", JSON.stringify(reassembled));

  tokens = tokenizeForHealing(reassembled);
  tokens.forEach(token => {
    if (token.type === 'inline-math') {
      let math = token.content.substring(1, token.content.length - 1).trim();
      math = math.replace(/~/g, '\\sim ');
      math = math.replace(/(?<!\\)\bsim\b/gi, '\\sim');
      math = math.replace(/(\d+\.?\d*)\s+(\d+\.?\d*)/g, '$1 \\sim $2');
      math = math.replace(/(?<![a-zA-Z\\])u\b/g, '\\nu');
      token.content = `$${math}$`;
    } else if (token.type === 'block-math') {
      let math = token.content.substring(2, token.content.length - 2).trim();
      math = math.replace(/~/g, '\\sim ');
      math = math.replace(/(?<!\\)\bsim\b/gi, '\\sim');
      math = math.replace(/(\d+\.?\d*)\s+(\d+\.?\d*)/g, '$1 \\sim $2');
      math = math.replace(/(?<![a-zA-Z\\])u\b/g, '\\nu');
      token.content = `$$${math}$$`;
    } else if (token.type === 'text') {
      token.content = token.content.replace(/(?<!\\)\bsim\b/gi, '~');
    }
  });

  reassembled = tokens.map(t => t.content).join('');
  console.log("19. Nu and sim replacement:\n", JSON.stringify(reassembled));

  reassembled = reassembled.replace(/([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])([\(\[\{])/g, '$1 $2');
  reassembled = reassembled.replace(/([\)\]\}])([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])/g, '$1 $2');
  console.log("20. Paren spacing:\n", JSON.stringify(reassembled));

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
      if (lastChar && !/\s/.test(lastChar) && !/[\(\[\{\'\"]/.test(lastChar)) needSpace = true;
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && current.type === 'text') {
      const firstChar = current.content[0];
      if (firstChar && !/\s/.test(firstChar) && !/[\,\.\?\!\)\]\}\:\;\*]/.test(firstChar)) needSpace = true;
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && (current.type === 'inline-math' || current.type === 'block-math')) {
      needSpace = true;
    }

    result += needSpace ? ' ' + current.content : current.content;
  }
  console.log("21. Spacing final:\n", JSON.stringify(result));
  return result;
}

const text1 = `$K_0 = #dfrac{ u}{1 - u}\n\n* K_0 : 정지토압계수(Coefficientofearthpressureatrest)*\n\nu$: 흙의 포아송 비 (Poisson's ratio of soil)`;
const text2 = `$Q = k #cdot H #cdot #dfrac{N_f}{N_d}\n\n* Q : 단위폭당침투유량*k: 흙의 투수계수\n\n* H : 상.하류측의전수두차*N_d$: 등수두선 낙차 수`;

console.log("=== STEP-BY-STEP FOR TEXT 1 ===");
healLatexFormulasStepByStep(text1);

console.log("\n=== STEP-BY-STEP FOR TEXT 2 ===");
healLatexFormulasStepByStep(text2);
