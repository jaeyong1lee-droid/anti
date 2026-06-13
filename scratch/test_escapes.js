const latexCommands = [
  'newline', 'nabla', 'nu', 'theta', 'tau', 'tan', 'times', 'tilde', 'text', 
  'rho', 'right', 'mathrm', 'rule', 'beta', 'bar', 'begin', 'frac', 'phi', 'varphi', 'forall'
];

function escapeJsonBackslashes(str) {
  if (!str) return str;
  let result = '';
  let inString = false;
  let i = 0;
  
  while (i < str.length) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
    } else if (inString && char === '\\') {
      const next = str[i + 1];
      
      if (next === '"' || next === '/' || next === '\\') {
        result += char + next;
        i += 2;
      } else if (next === 'n' || next === 't' || next === 'r' || next === 'b' || next === 'f') {
        let tempIndex = i + 1;
        let commandWord = '';
        while (tempIndex < str.length && /[a-zA-Z]/.test(str[tempIndex])) {
          commandWord += str[tempIndex];
          tempIndex++;
        }
        
        const isLatex = latexCommands.some(cmd => commandWord.startsWith(cmd));
        if (isLatex) {
          result += '\\\\';
          i++;
        } else {
          result += char + next;
          i += 2;
        }
      } else {
        result += '\\\\';
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}

function tokenizeForHealing(text) {
  const tokens = [];
  let lastIndex = 0;
  const regex = /(\$\$.*?\$\$)|(\$[^\$]+?\$)/gs;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const before = text.substring(lastIndex, match.index);
    if (before) {
      tokens.push({ type: 'text', content: before });
    }
    const mathContent = match[0];
    if (mathContent.startsWith('$$')) {
      tokens.push({ type: 'block-math', content: mathContent });
    } else {
      tokens.push({ type: 'inline-math', content: mathContent });
    }
    lastIndex = regex.lastIndex;
  }
  const after = text.substring(lastIndex);
  if (after) {
    tokens.push({ type: 'text', content: after });
  }
  return tokens;
}

const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'];

function healLatexFormulas(text) {
  if (!text) return text;
  
  let trimmed = text.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    trimmed = trimmed.substring(2, trimmed.length - 2).trim();
  } else if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }

  const hasMathIndicators = /\\(sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|Delta|omega|mu|lambda|psi|rho|eta|frac|sqrt|cdot|mathrm|text|log|Sigma|Gamma|Phi|Theta|Omega)\b/.test(trimmed) || 
                            /[_^{<>=]/.test(trimmed);
  const hasKorean = /[\uAC00-\uD7A3]/.test(trimmed);

  if (hasMathIndicators && !hasKorean && trimmed.length < 150) {
    const cleanedMath = trimmed.replace(/\$/g, '');
    return `$${cleanedMath}$`;
  }
  
  let healed = text;
  if (hasKorean && ((text.trim().startsWith('$$') && text.trim().endsWith('$$')) || (text.trim().startsWith('$') && text.trim().endsWith('$')))) {
    healed = trimmed;
  }

  const lines = healed.split('\n');
  const processedLines = lines.map(line => {
    const dollarCount = (line.match(/\$/g) || []).length;
    const isFormulaLine = /^[\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}\(\)\[\],.\\\\/]*?[<>=]+/.test(line);
    if (dollarCount === 1) {
      if (isFormulaLine) {
        return line.replace(/\$/g, '');
      }
    }
    return line;
  });
  healed = processedLines.join('\n');

  healed = healed.replace(/(\r?\n|^)(\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}\(\)\[\],.\\\\/]*?)\$([^$\n]*?)\$/g, (match, start, p1, p2) => {
    const hasBackslash = p1.includes('\\') || p2.includes('\\');
    const hasGreek = symbols.some(sym => p1.includes(sym) || p2.includes(sym));
    if (hasBackslash || hasGreek) {
      return start + '$' + p1 + p2 + '$';
    }
    return match;
  });

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

  let tokens = tokenizeForHealing(healed);
  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      const formulaPattern = /((?:\\?[a-zA-Z_0-9']+(?:_[a-zA-Z0-9{}]+)?\s*[<>=]+\s*[a-zA-Z0-9_'\s\-+\/{}\(\)\[\],.\\\\/<>:;!?^~&|%]*[a-zA-Z0-9'\)\}]))/g;
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

  let reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);

  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      symbols.forEach(sym => {
        const regex = new RegExp(`(?<!\\\\)\\b${sym}\\b`, 'g');
        t = t.replace(regex, `\\${sym}`);
      });

      const subscriptPattern = `(?:_[a-zA-Z0-9]+|_(?:\\{[a-zA-Z0-9_]+\\}))?`;
      const greekPattern = new RegExp(`(\\\\\\b(?:${symbols.join('|')})${subscriptPattern}(?![a-zA-Z0-9_]))`, 'g');
      t = t.replace(greekPattern, (match, p1) => '$' + p1 + '$');

      const plainSubscriptPattern = /((\b[a-zA-Z](?:_[a-zA-Z0-9]+|_(?:\{[a-zA-Z0-9_]+\}))(?![a-zA-Z0-9_])))/g;
      t = t.replace(plainSubscriptPattern, (match, p1) => '$' + p1 + '$');

      token.content = t;
    }
  });

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
    }
    if ((prev.type === 'inline-math' || prev.type === 'block-math') && current.type === 'text') {
      const firstChar = current.content[0];
      if (firstChar && !/\s/.test(firstChar)) {
        if (!/[\)\]\}\,\.\?\!\:\;\'\"]/.test(firstChar)) {
          needSpace = true;
        }
      }
    }

    result += (needSpace ? ' ' : '') + current.content;
  }
  return result;
}

const inputStr = '{"options": ["y_p = \\\\frac{p_p - p_0}{k_h}", "y_p = \\\\frac{p_p + p_0}{k_h}"]}';
const inputSingleStr = '{"options": ["y_p = \\frac{p_p - p_0}{k_h}", "y_p = \\frac{p_p + p_0}{k_h}"]}';

console.log('--- Double backslash input:');
const parsedDouble = JSON.parse(escapeJsonBackslashes(inputStr));
console.log('Parsed:', parsedDouble.options);
console.log('Healed:', parsedDouble.options.map(opt => healLatexFormulas(opt)));

console.log('--- Single backslash input:');
const parsedSingle = JSON.parse(escapeJsonBackslashes(inputSingleStr));
console.log('Parsed:', parsedSingle.options);
console.log('Healed:', parsedSingle.options.map(opt => healLatexFormulas(opt)));
