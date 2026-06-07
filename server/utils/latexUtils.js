// Self-Healing LaTeX Formula Post-Processor to automatically repair missing backslashes and math delimiters ($...$)

export function tokenizeForHealing(text) {
  if (!text) return [];
  const tokens = [];
  let lastIndex = 0;
  
  // 줄바꿈(\n)이 섞여 있어도 수식 기호($) 쌍을 정확하게 포착하도록 정규식 유지
  const regex = /(\$\$.*?\$\$)|(\$[^\$]+?\$)/gs;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const before = text.substring(lastIndex, match.index);
    if (before) {
      tokens.push({ type: 'text', content: before });
    }
    const matchContent = match[0];
    if (matchContent.startsWith('$$')) {
      tokens.push({ type: 'block-math', content: matchContent });
    } else {
      const math = matchContent.substring(1, matchContent.length - 1);
      const hasNewline = math.includes('\n');
      const hasDoubleNewline = math.includes('\n\n');
      const hasMathIndicators = /\\|[_^{}<=]/.test(math);
      
      // [안전 장치 강화] 인라인 수식 토큰의 길이가 너무 길거나(Lone Dollar 매칭 오염), 
      // 단락 구분(\n\n)이 포함되어 있다면 수식 영역에서 탈탈 털어내고 텍스트 처리
      if (hasDoubleNewline || (hasNewline && !hasMathIndicators) || math.length > 200) {
        tokens.push({ type: 'text', content: matchContent[0] });
        lastIndex = match.index + 1;
        regex.lastIndex = lastIndex;
        continue;
      }
      tokens.push({ type: 'inline-math', content: matchContent });
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

  // 1. 로그 및 자연로그 기호 표준화
  healed = healed.replace(/(?<!\\)\blog\b/g, '\\log');
  healed = healed.replace(/(?<!\\)\bln\b/g, '\\ln');
  healed = healed.replace(/(?<!\\)\blog(?=[pt_0-9])/g, '\\log ');
  healed = healed.replace(/(?<!\\)\bln(?=[pt_0-9])/g, '\\ln ');

  // 2. 그리스 문자 목록 구조화
  const greekSymbols = [
    'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
    'zeta', 'xi', 'chi', 'upsilon', 'nu'
  ];

  const safeMathCommands = [
    'frac', 'dfrac', 'sqrt', 'rightarrow', 'leftarrow', 'cdot'
  ];

  const mathModeCommands = [
    'left', 'right', 'le', 'ge', 'lt', 'gt', 'times', 'div', 'pm', 'infty', 'partial', 'sum', 'int', 'tan', 'sin', 'cos', 'sec', 'cosec', 'cot', 'sim'
  ];

  const keywordsToHeal = isMathMode 
    ? [...greekSymbols, ...safeMathCommands, ...mathModeCommands]
    : [...greekSymbols, ...safeMathCommands];

  keywordsToHeal.forEach(kw => {
    const regex = new RegExp(`(?<!\\\\)\\b${kw}(?![a-zA-Z])`, 'g');
    healed = healed.replace(regex, `\\${kw}`);
  });

  if (isMathMode) {
    healed = healed.replace(/(?<![a-zA-Z\\])\\u\b/g, '\\nu');
  }

  return healed;
}

export function cleanCorruptedFormula(formula) {
  if (!formula || typeof formula !== 'string') return formula;
  
  let cleaned = formula;
  if ((cleaned.includes('color:#cc0000') && (cleaned.includes('katex-error') || cleaned.includes('title="'))) || cleaned.includes('math mode at position')) {
    const match = cleaned.match(/color:#cc0000"\s*>\s*([^<]+?)\s*<\s*\/\s*span\s*>/i) ||
                  cleaned.match(/color:#cc0000"\s*&gt;\s*([^&]+?)\s*&lt;\s*\/\s*span\s*&gt;/i);
                  
    if (match) {
      const coreMath = match[1].trim();
      const closingSpanIndex = cleaned.search(/<\s*\/\s*span\s*>/i);
      let rest = '';
      if (closingSpanIndex !== -1) {
        const restStart = cleaned.indexOf('>', closingSpanIndex);
        if (restStart !== -1) rest = cleaned.substring(restStart + 1);
      } else {
        const closingSpanIndexEntity = cleaned.search(/&lt;\s*\/\s*span\s*&gt;/i);
        if (closingSpanIndexEntity !== -1) {
          const restStart = cleaned.indexOf('&gt;', closingSpanIndexEntity);
          if (restStart !== -1) rest = cleaned.substring(restStart + 4);
        }
      }
      
      let cleanRest = rest
        .replace(/<\s*\/\s*(span|div|p)\s*>/gi, '')
        .replace(/<\s*(div|span|p)[^>]*>/gi, '')
        .replace(/&lt;\s*\/\s*(span|div|p)\s*&gt;/gi, '')
        .replace(/&lt;\s*(div|span|p)[^&]*&gt;/gi, '')
        .trim();
        
      cleaned = `$$${coreMath}$$\n\n${cleanRest}`;
    }
  }
  return cleaned;
}

export function healLatexFormulas(text) {
  if (!text) return text;
  if (typeof text !== 'string') return text;

  // 인라인 HTML 태그를 마크다운 구조로 가공 (4단계 정밀 처리)
  // Step 1: <br> → 빈 줄
  text = text.replace(/<br\s*\/?>/gi, '\n\n');
  // Step 2: 빈 spacer div 제거 (height only 등)
  text = text.replace(/<div[^>]*>\s*<\/div>/gi, '');
  // Step 3: 텍스트 내용이 있는 styled div → 마크다운 리스트 항목으로 변환
  //         앞에 붙은 •, *, 공백 모두 제거하고 내용만 추출
  text = text.replace(/<div[^>]*>\s*[•*]?\s*([^<]+?)\s*<\/div>/gi, '\n\n* $1');
  // Step 4: 나머지 고아 HTML 태그(div, p 잔재 등) 제거. span은 cleanCorruptedFormula에서 처리하므로 보존
  text = text.replace(/<\/?(?:div|p|li|ul|ol|section|article)\b[^>]*>/gi, '');
  // 3개 이상의 연속 개행 → 최대 2개로 압축
  text = text.replace(/\n{3,}/g, '\n\n');

  // Misplaced variable dollar early conversion
  text = text.replace(/(?<!\$)\b([a-zA-Z_][a-zA-Z0-9_]*)\$(?=:|\s|\n|$)/g, (match, p1) => '$' + p1 + '$');

  // 글머리 기호 붙어있는 케이스 격리 개행
  text = text.replace(/([^\n\s])\s*\*+\s*([a-zA-Z0-9_\uAC00-\uD7A3\$]+:)/g, '$1\n\n* $2');

  // 해시태그 수식 복원
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

  text = cleanCorruptedFormula(text);

  text = text.replace(/&#x27;/g, "'")
             .replace(/&quot;/g, '"')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&amp;/g, '&');
  
  text = text.replace(/([\.?!\)\]\}])\s*\*\s*(?=[\uAC00-\uD7A3])/g, '$1\n\n* ');

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

  // 백슬래시 정상 복원 및 내부 공백 최적화 진행
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
    return `$$${cleanedMath}$$`;
  }
  
  const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'];
  let healed = text;
  if (hasKorean && ((text.trim().startsWith('$$') && text.trim().endsWith('$$')) || (text.trim().startsWith('$') && text.trim().endsWith('$')))) {
    const isRealFormula = /\\/.test(trimmed) || /_/.test(trimmed) || /\^/.test(trimmed) || /[=+\-\*\/]/.test(trimmed) || /\\cdot/.test(trimmed);
    if (!isRealFormula) {
      healed = trimmed;
    }
  }

  const lines2 = healed.split('\n');
  const processedLines = lines2.map(line => {
    const dollarCount = (line.match(/\$/g) || []).length;
    const isFormulaLine = /^[\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}\(\)\[\],.\\\\/]*?[<>=]+/.test(line);
    if (dollarCount === 1 && isFormulaLine) {
      return line.replace(/\$/g, '');
    }
    return line;
  });
  healed = processedLines.join('\n');

  healed = healed.replace(/(\r?\n|^)(\\?[a-zA-Z_']+[a-zA-Z0-9_'\-+\*\/\{\}\(\)\[\]\.\\\\/]*?)\$([^$\n]*?)\$/g, (match, start, p1, p2) => {
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
        // [수식 포착 정규식 보완] 일반 공백 텍스트 오염을 막기 위해 텍스트 내 자동 포착 방어 조건 강화
        const formulaPattern = /([a-zA-Z0-9_\-\+\/()\[\]\{\} \t=<>\\.,\^·~']+)/g;
        t = t.replace(formulaPattern, (match) => {
          const trimmedMatch = match.trim();
          if (!trimmedMatch) return match;
          if (trimmedMatch.startsWith('$')) return match;
          if (/^[a-zA-Z0-9\s]+$/.test(trimmedMatch)) return match;
          
          const hasBackslash = trimmedMatch.includes('\\');
          const hasGreek = symbols.some(sym => trimmedMatch.includes(sym));
          const hasMathContext = /[=<>+\/]/.test(trimmedMatch) || /_[a-zA-Z0-9{}]/.test(trimmedMatch) || /\^/.test(trimmedMatch) || /\s-\s/.test(trimmedMatch);
          
          if (hasBackslash || hasGreek || hasMathContext) {
            // 백슬래시가 없는 일반 변수/기호 결합문인데 글자수가 너무 길면 수식 자동 감싸기 제외 (오염 방지)
            if (trimmedMatch.length > 40 && !hasBackslash) return match;
            
            const isComplex = trimmedMatch.includes('\\frac') || trimmedMatch.includes('\\dfrac') || trimmedMatch.includes('\\log') || (trimmedMatch.length > 45 && hasBackslash);
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
  tokens = tokenizeForHealing(reassembledAfterStep1);

  tokens.forEach(token => {
    if (token.type === 'text') {
      token.content = runOnTextOnly(token.content, (t) => {
        return t.replace(/\(([^)$]*?(?:\\gamma|\\sigma|\\theta|\\phi|\\alpha|\\beta|\\frac|\\dfrac|\\delta|\\Delta|_[a-zA-Z0-9{])[^)$]*?)\)/g, (match, p1) => {
          if (p1.includes('\\left') || p1.includes('\\right')) return match;
          return '($' + p1.trim() + '$)';
        });
      });
    }
  });

  let reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);
  tokens.forEach(token => {
    if (token.type === 'text') {
      token.content = runOnTextOnly(token.content, (t) => {
        const mathWords = [
          'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
          'frac', 'dfrac', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 'tan', 'approx', 'partial'
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
  const finalTokens = tokenizeForHealing(reassembled);

  finalTokens.forEach(token => {
    if (token.type === 'inline-math') {
      let math = token.content.substring(1, token.content.length - 1).trim();
      math = math.replace(/~/g, '\\sim ');
      math = math.replace(/(?<!\\)\bsim\b/gi, '\\sim');
      math = math.replace(/(\d+\.?\d*)\s+(\d+\.?\d*)/g, '$1 \\sim $2');
      
      // [간극수압/응력 맥락 보호] 수식 내에 \sigma, \tau, P_w 가 있으면 u는 간극수압
      // u가 첨자(_u)이거나 영문자 뒤에 붙어있을 때는 lookbehind가 이미 보호함
      const isPorePressure = /\\sigma|\\tau|P_w/i.test(math);
      if (isPorePressure) {
        math = math.replace(/(?<![a-zA-Z\\_])u\b/g, '__PORE_U__');
        math = math.replace(/(?<![a-zA-Z\\_])u\b/g, '\\nu');
        math = math.replace(/__PORE_U__/g, 'u');
      } else {
        math = math.replace(/(?<![a-zA-Z\\_])u\b/g, '\\nu');
      }
      
      token.content = `$${math}$`;
    } else if (token.type === 'block-math') {
      let math = token.content.substring(2, token.content.length - 2).trim();
      math = math.replace(/~/g, '\\sim ');
      math = math.replace(/(?<!\\)\bsim\b/gi, '\\sim');
      math = math.replace(/(\d+\.?\d*)\s+(\d+\.?\d*)/g, '$1 \\sim $2');
      
      // 블록 수식도 동일 로직 적용
      const isPorePressure = /\\sigma|\\tau|P_w/i.test(math);
      if (isPorePressure) {
        math = math.replace(/(?<![a-zA-Z\\_])u\b/g, '__PORE_U__');
        math = math.replace(/(?<![a-zA-Z\\_])u\b/g, '\\nu');
        math = math.replace(/__PORE_U__/g, 'u');
      } else {
        math = math.replace(/(?<![a-zA-Z\\_])u\b/g, '\\nu');
      }
      
      token.content = `$$${math}$$`;
    } else if (token.type === 'text') {
      token.content = token.content.replace(/(?<!\\)\bsim\b/gi, '~');
    }
  });

  reassembled = finalTokens.map(t => t.content).join('');

  reassembled = reassembled.replace(/(^\s*\*+\s*)([a-zA-Z0-9_]+(?:_[a-zA-Z0-9]+)?)(?=\s*:)/gm, (match, bullet, name) => {
    if (name.startsWith('$') || name.endsWith('$')) return match;
    return bullet + '$' + name + '$';
  });
  
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
      if (lastChar && !/\s/.test(lastChar) && !/[\(\[\{\'\"]/.test(lastChar)) needSpace = true;
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && current.type === 'text') {
      const firstChar = current.content[0];
      if (firstChar && !/\s/.test(firstChar) && !/[\,\.\?\!\)\]\}\:\;\*]/.test(firstChar)) needSpace = true;
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && (current.type === 'inline-math' || current.type === 'block-math')) {
      needSpace = true;
    }

    result += needSpace ? ' ' + current.content : current.content;
  }

  result = result.replace(/(\$[^\$]+?\$)(은|는|이|가|을|를|의|로|으로|에|에서|와|과|도|만)/g, '$1 $2');

  return result;
}

// 💡 [업그레이드] 프로토타입 오염 및 프레임워크 관찰 객체 순회 한계를 극복한 마스터 딥 힐러
function healDeep(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return healLatexFormulas(obj);
  }
  if (typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => healDeep(item));
  }
  try {
    const healed = {};
    const keys = Object.keys(obj);
    for (const key of keys) {
      healed[key] = healDeep(obj[key]);
    }
    const proto = Object.getPrototypeOf(obj);
    if (proto && proto !== Object.prototype) {
      return Object.assign(Object.create(proto), healed);
    }
    return healed;
  } catch (e) {
    return obj;
  }
}

export function healQuizQuestionObject(q) { return healDeep(q); }
export function healTheoryQuestionObject(t) { return healDeep(t); }
export function healFormulaQuestionObject(f) { return healDeep(f); }
export function healAnswersheetQuestionObject(a) { return healDeep(a); }

export const LATEX_PROMPT_INSTRUCTIONS = `
[🚨 극도로 중요한 LaTeX 수식 및 마크다운 렌더링 절대 준수 수칙]:
1. 모든 수학 공식 및 개별 물리/공학 변수 기호(예: $K_s$, $k_h$, $e$, $c$, \\phi, \\sigma, \\tau, $u$, $z_c$, $F.S.$ 등)는 단독 문장 혹은 보기, 해설 내에 노출될 때도 무조건 인라인 LaTeX 기호 포맷인 $변수명$ 형태로 감싸서 출력하십시오. 날것의 텍스트 표기(예: \\gamma_w)는 엄격히 금지합니다. 반드시 $\\gamma_w$ 와 같이 감싸십시오. 보기 문항과 해설(explanation, answer 등)에도 수식을 적극적으로 활용하되 반드시 기호로 감싸야 합니다.
2. 모든 LaTeX 명령어의 역슬래시(\\)는 JSON 파싱 에러 방지를 위해 반드시 이중 역슬래시(\\\\)로 작성하십시오. (예: \\\\frac{a}{b}, \\\\sigma, \\\\cdot 등)
3. 인라인 수식 작성 시 $ 기호와 수식 내용 사이에 절대 공백(스페이스)을 두지 마십시오. (예: $수식$ (O) / $ 수식 $ (X))
4. 외부 공백 필수 조건: $ 기호의 앞과 뒤가 한글, 숫자, 문장 부호와 맞닿을 경우 반드시 앞뒤로 '한 칸의 공백(스페이스)'을 명시적으로 두어 격리하십시오. 한국어 조사('가', '는', '입니다' 등)와 결합할 때도 예외 없이 한 칸 띄우고 조사를 작성하십시오. (예: $B$ 가 4배로 증가 (O) / $B$가 4배로 증가 (X))
5. 인라인 수식 내 줄바꿈 절대 금지: 문장 중간의 $ 기호 사이 내용에서는 엔터(줄바꿈)를 절대 하지 말고 단일 줄로 이어서 작성하십시오.
6. 분수(\\\\frac), 거듭제곱근(\\\\sqrt), 미분방정식 항이 중첩된 복잡한 전개 수식은 문장 중간에 절대 섞어 쓰지 말고, 반드시 수식 블록 위아래로 빈 줄을 한 칸씩 띄운 뒤 디스플레이 수식 블록($$수식$$)으로 완벽히 독립시켜 독자 단락으로 분리 출력하십시오.
7. 단순 수치나 단위(예: 10m, 20% 등)에는 LaTeX 기호($)를 쓰지 말고 일반 텍스트로 작성하십시오.
8. 수식 내부에서 특수 기호인 '작다' 기호는 \\\\lt 로, '크다' 기호는 \\\\gt 로 표기하여 마크다운 파싱 에러를 원천 차단하십시오.
9. 아래첨자('_')나 괄호 기호 앞에 마크다운 렌더링 충돌 방지라는 핑계로 임의의 역슬래시(\\)를 붙여 시스템 깨짐(₩)을 유발하는 거동을 절대 하지 마십시오.
10. LaTeX 공식 내부 중괄호 내에 한글을 결합하는 \\\\text{한글} 과 같은 행위는 철저히 금지합니다. 한글과 만날 때는 수식을 즉시 닫고 공백을 준 뒤 한글을 배치하십시오. (예: $B$ 가 4배로 증가)
11. 달러 기호($ 또는 $$)는 반드시 수식 전체를 감싸는 가장 바깥쪽에만 위치해야 하며, 중괄호({}) 내부에 달러 기호가 침투하지 않도록 이중 마킹을 엄격히 금지합니다.
12. 🚨 [마크다운 리스트 및 줄바꿈 수칙]: JSON 응답 내에서 항목을 나열하기 위해 리스트 기호(* 또는 -)를 사용할 때는 반드시 기호 뒤에 스페이스(공백)를 한 칸 띄우고 텍스트를 작성하십시오. (예: "* k: 투수계수" (O) / "*k: 투수계수" (X)). 
14. 🚨 [문단 격리 규칙]: JSON 내부의 문자열 항목(concept, explanation, answer 등) 구조에서 새로운 제목(###)이나 글머리 기호(*, -)가 시작될 때는, 반드시 바로 직전 문장 끝에 명시적인 줄바꿈 기호 두 개(\n\n)를 삽입하여 완벽한 독자 단락으로 분리 출력하라. 절대로 앞 문장과 같은 줄에 공백만 띄우고 이어서 붙이지 마라.
13. 문단 구분이나 줄바꿈을 할 때는 프론트엔드 마크다운 렌더러가 텍스트를 한 줄로 뭉개지 않도록 반드시 줄바꿈 기호를 두 번 연속(\\\\n\\\\n) 사용하여 명확하게 문단을 분리하십시오.
15. 🚨 [HTML 태그 사용 절대 금지]: 어떠한 경우에도 답변 항목 내부에 <div>, <span>, <strong> 등 임의의 HTML 스타일 태그를 직접 작성하여 주입하지 마십시오. 레이아웃 붕괴를 유발하므로 텍스트 강조 시에는 오직 마크다운 문법(예: **강조**)을 사용하십시오.

[원시 JSON 출력 엄격 준수 규칙]
- JSON 구조 내부의 문자열에 LaTeX 수식을 작성할 때, 백슬래시(\\) 기호는 JSON 문법 표준에 의거하여 반드시 두 번 겹친 이스케이프 형태('\\\\frac', '\\\\alpha')로만 출력해야 합니다. 
- 절대로 단일 백슬래시('\\frac') 형태로 가공되지 않은 원시 문자열을 JSON 내부에 주입하여 문법 에러(Cartesian/Escape Syntax Error)를 유발하지 마십시오.

[JSON String Escape Rule]:
When generating LaTeX formulas inside a JSON string, you must strictly escape the backslash twice (e.g., "\\\\frac", "\\\\alpha") to ensure that the response remains perfectly valid for native JSON.parse() without crashing the backend system.
`;

export const LATEX_CHAT_PROMPT_INSTRUCTIONS = `
[🚨 극도로 중요한 LaTeX 수식 및 마크다운 렌더링 절대 준수 수칙]:
0. 🚨 [절대 금지 - JSON 응답 금지]: 당신은 실시간 대화형 챗봇/해설사이므로 절대로 JSON 형식(예: {"concept": "...", "explanation": "..."})으로 응답을 감싸서 출력하지 마십시오. 중괄호({ })나 큰따옴표가 들어간 JSON 키-값 구조는 렌더링 오류를 발생시킵니다. 오직 일반적인 한글 대화 문장 및 마크다운 포맷으로만 직접 답변하십시오.
1. 모든 수학 공식 및 개별 물리/공학 변수 기호(예: $K_s$, $k_h$, $e$, $c$, \\phi, \\sigma, \\tau, $u$, $z_c$, $F.S.$ 등)는 단독 문장 혹은 보기, 해설 내에 노출될 때도 무조건 인라인 LaTeX 기호 포맷인 $변수명$ 형태로 감싸서 출력하십시오. 날것의 텍스트 표기(예: \\gamma_w)는 엄격히 금지합니다. 반드시 $\\gamma_w$ 와 같이 감싸십시오. 답변에도 수식을 적극적으로 활용하되 반드시 기호로 감싸야 합니다.
2. 모든 LaTeX 명령어의 역슬래시(\\)는 단일 역슬래시(\\frac, \\sigma)로 작성하십시오. (※ JSON이 아닌 일반 마크다운 출력이므로 이중 역슬래시가 아닌 단일 역슬래시로 출력해야 정상 렌더링됩니다.)
3. 인라인 수식 작성 시 $ 기호와 수식 내용 사이에 절대 공백(스페이스)을 두지 마십시오. (예: $수식$ (O) / $ 수식 $ (X))
4. 외부 공백 필수 조건: $ 기호의 앞과 뒤가 한글, 숫자, 문장 부호와 맞닿을 경우 반드시 앞뒤로 '한 칸의 공백(스페이스)'을 명시적으로 두어 격리하십시오. 한국어 조사('가', '는', '입니다' 등)와 결합할 때도 예외 없이 한 칸 띄우고 조사를 작성하십시오. (예: $B$ 가 4배로 증가 (O) / $B$가 4배로 증가 (X))
5. 인라인 수식 내 줄바꿈 절대 금지: 문장 중간의 $ 기호 사이 내용에서는 엔터(줄바꿈)를 절대 하지 말고 단일 줄로 이어서 작성하십시오.
6. 분수(\\\\frac), 거듭제곱근(\\\\sqrt), 미분방정식 항이 중첩된 복잡한 전개 수식은 문장 중간에 절대 섞어 쓰지 말고, 반드시 수식 블록 위아래로 빈 줄을 한 칸씩 띄운 뒤 디스플레이 수식 블록($$수식$$)으로 완벽히 독립시켜 독자 단락으로 분리 출력하십시오.
7. 단순 수치나 단위(예: 10m, 20% 등)에는 LaTeX 기호($)를 쓰지 말고 일반 텍스트로 작성하십시오.
8. 수식 내부에서 특수 기호인 '작다' 기호는 \\\\lt 로, '크다' 기호는 \\\\gt 로 표기하여 마크다운 파싱 에러를 원천 차단하십시오.
9. 아래첨자('_')나 괄호 기호 앞에 임의의 역슬래시(\\)를 붙이지 마십시오.
10. LaTeX 공식 내부 중괄호 내에 한글을 결합하는 \\\\text{한글} 과 같은 행위는 철저히 금지합니다. 한글과 만날 때는 수식을 즉시 닫고 공백을 준 뒤 한글을 배치하십시오. (예: $B$ 가 4배로 증가)
11. 달러 기호($ 또는 $$)는 반드시 수식 전체를 감싸는 가장 바깥쪽에만 위치해야 하며, 중괄호({}) 내부에 달러 기호가 침투하지 않도록 이중 마킹을 엄격히 금지합니다.
12. 🚨 [마크다운 리스트 및 줄바꿈 수칙]: 항목을 나열하기 위해 리스트 기호(* 또는 -)를 사용할 때는 반드시 기호 뒤에 스페이스(공백)를 한 칸 띄우고 텍스트를 작성하십시오. (예: "* k: 투수계수" (O) / "*k: 투수계수" (X)). 
13. 새로운 단락(문단)이나 글머리 기호(*, -), 또는 제목(###)이 시작될 때는 반드시 바로 앞에 줄바꿈 기호 두 개(\\n\\n)를 명시적으로 삽입하십시오. 절대로 앞 문장에 이어서 작성하지 마십시오. (예: "...예측합니다.\\n\\n* 응력 전이:" (O) / "...예측합니다.* 응력 전이:" (X))
14. 문단 구분이나 줄바꿈을 할 때는 프론트엔드 마크다운 렌더러가 텍스트를 한 줄로 뭉개지 않도록 반드시 줄바꿈 기호를 두 번 연속(\\n\\n) 사용하여 명확하게 문단을 분리하십시오.
15. 🚨 [HTML 태그 사용 절대 금지]: 어떠한 경우에도 답변에 <div>, <span>, <strong> 등 임의의 HTML 스타일 태그를 직접 작성하여 주입하지 마십시오. 레이아웃 붕괴를 유발하므로 텍스트 강조 시에는 오직 마크다운 문법(예: **강조**)을 사용하십시오.
`;
