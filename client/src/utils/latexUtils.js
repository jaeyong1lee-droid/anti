// Self-Healing LaTeX Formula Post-Processor to automatically repair missing backslashes and math delimiters ($...$)

export function tokenizeForHealing(text) {
  const tokens = [];
  let lastIndex = 0;
  // 인라인 수식이 줄바꿈을 넘어 매칭되지 않도록 방어
  const regex = /(\$\$.*?\$\$)|(\$[^\$\n]+?\$)/gs;
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

export function healBackslashes(str, isMathMode = false) {
  if (!str) return str;
  let healed = str;

  // 1. Handle log and ln specifically to support logp, logt, log_10, lnp, lnt, etc.
  healed = healed.replace(/(?<!\\)\blog\b/g, '\\log');
  healed = healed.replace(/(?<!\\)\bln\b/g, '\\ln');
  healed = healed.replace(/(?<!\\)\blog(?=[pt_0-9])/g, '\\log ');
  healed = healed.replace(/(?<!\\)\bln(?=[pt_0-9])/g, '\\ln ');

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

export function healLatexFormulas(text) {
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
  
  // 💡 [단일 공식/수식형 전체 감싸기 최적화]
  let trimmed = healed.trim();
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
  
  const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'];
  if (hasKorean && ((healed.trim().startsWith('$$') && healed.trim().endsWith('$$')) || (healed.trim().startsWith('$') && healed.trim().endsWith('$')))) {
    healed = trimmed;
  }

  // 1. 단일 구분 기호 유실 라인 복구
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

  // 2. 파편화된 수식 기호 복구 (\theta = \frac{$\delta}{L}$ -> $\theta = \frac{\delta}{L}$)
  healed = healed.replace(/(\r?\n|^)(\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}\(\)\[\],.\\\\/]*?)\$([^$\n]*?)\$/g, (match, start, p1, p2) => {
    const hasBackslash = p1.includes('\\') || p2.includes('\\');
    const hasGreek = symbols.some(sym => p1.includes(sym) || p2.includes(sym));
    if (hasBackslash || hasGreek) {
      return start + '$' + p1 + p2 + '$';
    }
    return match;
  });

  // 3. 중괄호 내부 분수 split 기호 정제
  healed = healed.replace(/\\frac\s*\{\s*\$([^\$]+?)\}/g, '\\frac{$1}');
  healed = healed.replace(/\{\s*\$([^\$]+?)\s*\}/g, '{$1}');

  // 4. 산술 연산자 쪼개짐 복원
  healed = healed.replace(/(\d+)\s*\$\s*([\/+\-*])\s*(\d+)/g, '$1$2$3');

  // 5. 텍스트 세그먼트 내 이중 백슬래시 오염 단일화
  {
    const rule5Tokens = tokenizeForHealing(healed);
    healed = rule5Tokens.map(tok => {
      if (tok.type !== 'text') return tok.content;
      return tok.content.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
    }).join('');
  }

  // STEP 1: 비교/등호 수식 자동 감지 및 래핑
  let tokens = tokenizeForHealing(healed);
  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      
      // We use a robust character class matcher that does not include newlines to prevent greedy matching
      const formulaPattern = /([a-zA-Z0-9_\-\+\*\/()\[\]\{\} \t=<>\\.,\^·~']+)/g;
      t = t.replace(formulaPattern, (match) => {
        const trimmedMatch = match.trim();
        if (!trimmedMatch) return match;
        if (trimmedMatch.startsWith('$')) return match;
        if (/^[a-zA-Z0-9\s]+$/.test(trimmedMatch)) return match;
        
        const hasBackslash = trimmedMatch.includes('\\');
        const hasGreek = symbols.some(sym => trimmedMatch.includes(sym));
        const hasMathContext = /[=<>+\-*\/]/.test(trimmedMatch) || /_[a-zA-Z0-9{}]/.test(trimmedMatch);
        
        if (hasBackslash || hasGreek || hasMathContext) {
          const isComplex = trimmedMatch.includes('\\frac') || trimmedMatch.includes('\\log') || trimmedMatch.length > 40;
          return isComplex ? `$$${trimmedMatch}$$` : `$${trimmedMatch}$`;
        }
        return match;
      });

      t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
      t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*u)/g, (match, p1) => '$' + p1 + '$');
      t = t.replace(/(\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
      token.content = t;
    }
  });

  // STEP 1.5: 괄호식 내부 미정제 기호 포획
  let reassembledAfterStep1 = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembledAfterStep1);
  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      t = t.replace(/\(([^)$]*?(?:\\gamma|\\sigma|\\theta|\\phi|\\alpha|\\beta|\\frac|\\delta|\\Delta|_[a-zA-Z0-9{])[^)$]*?)\)/g, (match, p1) => {
        if (p1.includes('\\left') || p1.includes('\\right')) return match;
        return '($' + p1.trim() + '$)';
      });
      token.content = t;
    }
  });

  // STEP 2: 개별 그리스 문자 및 하첨자 변수 강제 래핑
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

      const plainSubscriptPattern = /(?<![a-zA-Z0-9_\\\$])\b(u|t|z|k|e|c|p|q|d|H_d|c_v|T_v|m_v|E|I|P_0|K_0|K_a|K_p|N_c|N_q|N_\\gamma|F\.S\.)\b(?![a-zA-Z0-9_\$])/g;
      t = t.replace(plainSubscriptPattern, (match, p1) => '$' + p1 + '$');
      token.content = t;
    }
  });

  // STEP 3: 수식 블록 내 거동 인자 미세 교정 (\by_1 -> \gamma_1)
  reassembled = tokens.map(t => t.content).join('');
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
      token.content = isBlock ? `$$${math}$$` : `$${math}$`;
    }
  });

  reassembled = tokens.map(t => t.content).join('');
  const finalTokens = tokenizeForHealing(reassembled);

  // 규칙 1 준수: 수식 내부 공백 제거
  finalTokens.forEach(token => {
    if (token.type === 'inline-math') {
      token.content = `$${token.content.substring(1, token.content.length - 1).trim()}$`;
    } else if (token.type === 'block-math') {
      token.content = `$$${token.content.substring(2, token.content.length - 2).trim()}$$`;
    }
  });

  reassembled = finalTokens.map(t => t.content).join('');
  reassembled = reassembled.replace(/([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])([\(\[\{])/g, '$1 $2');
  reassembled = reassembled.replace(/([\)\]\}])([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])/g, '$1 $2');

  // 규칙 2 준수: 외부 한글 경계 영역에 철저한 공백 격리 적용
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

  // 6. Formatting & Spacing Cleanup
  result = result.replace(/[ \t]+/g, ' '); 
  result = result.replace(/\n{3,}/g, '\n\n'); 
  result = result.replace(/\$\$+/g, '$$');
  result = result.replace(/\$\$[ \t]*\$\$/g, '');
  result = result.replace(/\$[ \t]*\$/g, '');

  result = result.replace(/\$\$([^\$\n]+?)\$(?!\$)/g, (match, p1) => {
    if (/[\uAC00-\uD7A3]/.test(p1)) return match;
    return '$' + p1 + '$';
  });
  result = result.replace(/(?<!\$)\$([^\$\n]+?)\$\$/g, (match, p1) => {
    if (/[\uAC00-\uD7A3]/.test(p1)) return match;
    return '$' + p1 + '$';
  });

  result = result.replace(/(^\s*[•\-*\u2022]\s*[^\n]+)\n\s*\n(?=\s*[•\-*\u2022]\s*)/gm, '$1\n');
  result = result.replace(/(\b\d+\.)([^\s\d])/g, '$1 $2'); // spacing after list item numbers

  return result;
}
