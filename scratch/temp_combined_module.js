
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

function healLatexFormulas(text) {
  const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'];
  // AI의 이중 이스케이프 오류(예: \\frac -> \frac) 강제 복구 (최우선 수행)
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
    text = text.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
      if (safeLatexCommands.includes(p1)) return '\\' + p1;
      return match;
    });
  }
  if (!text) return text;

  // --- NEW PRE-PROCESSING: Fix mismatched / fragmented dollar signs on variables ---
  // Rule A: Missing leading dollar for Greek variable (e.g. \sigma_v$ -> $\sigma_v$)
  const missingLeadingRegex = new RegExp(
    `(?<!\\$)\\\\(?:${symbols.join('|')}|nabla|partial)(?:_(?:[a-zA-Z0-9]+|\\{[a-zA-Z0-9_]+\\}))?(?:')?\\$`,
    'g'
  );
  text = text.replace(missingLeadingRegex, (match) => `$${match}`);

  // Rule B: Missing trailing dollar for Greek variable (e.g. $\phi -> $\phi$)
  const missingTrailingRegex = new RegExp(
    `\\$(?:\\\\(?:${symbols.join('|')}|nabla|partial)(?:_(?:[a-zA-Z0-9]+|\\{[a-zA-Z0-9_]+\\}))?(?:')?)(?![a-zA-Z0-9_$])`,
    'g'
  );
  text = text.replace(missingTrailingRegex, (match) => `${match}$`);

  // Rule C: Line-by-line formula healing
  const fileLines = text.split('\n');
  const preProcessedLines = fileLines.map(line => {
    let trimmed = line.trim();
    if (!trimmed) return line;

    // Check if the line matches a math formula followed by non-math text/headers
    // e.g. \sigma_v$ = ... $**[변수 설명]***
    // We use [^\uAC00-\uD7A3]* to match all non-Korean characters up to the last $ before the first Korean character
    const formulaSplitRegex = /^([^\uAC00-\uD7A3]*\$)\s*([^\uAC00-\uD7A3]*[\uAC00-\uD7A3].*)$/;
    const splitMatch = trimmed.match(formulaSplitRegex);
    if (splitMatch) {
      let mathPart = splitMatch[1];
      const descPart = splitMatch[2];
      // Heal the math part
      const hasMathIndicators = /\\(sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|Delta|omega|mu|lambda|psi|rho|eta|frac|sqrt|cdot|mathrm|text|log|Sigma|Gamma|Phi|Theta|Omega)\b/.test(mathPart) || 
                                /[_^{<>=]/.test(mathPart);
      if (hasMathIndicators) {
        mathPart = mathPart.replace(/\$/g, '').trim();
        // Return single wrapped math block + descPart
        return `\$${mathPart}\$ ${descPart}`;
      }
    }

    // If the entire line is a formula with no Korean characters and has math indicators
    const hasMathIndicators = /\\(sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|Delta|omega|mu|lambda|psi|rho|eta|frac|sqrt|cdot|mathrm|text|log|Sigma|Gamma|Phi|Theta|Omega)\b/.test(trimmed) || 
                              /[_^{<>=]/.test(trimmed);
    const hasKorean = /[\uAC00-\uD7A3]/.test(trimmed);
    const isHeader = trimmed.startsWith('#');

    if (hasMathIndicators && !hasKorean && !isHeader) {
      const cleaned = trimmed.replace(/\$/g, '').trim();
      return `\$${cleaned}\$`;
    }

    return line;
  });
  text = preProcessedLines.join('\n');
  // --- END OF NEW PRE-PROCESSING ---

  // 수식 구분자($) 내부가 순수 한글/공백으로만 된 오염된 래핑 강제 제거
  text = text.replace(/\$([가-힣\s,\.\?\!\(\)\[\]]+?)\$/g, '$1');

  // $수식변수 한글텍스트$ 패턴 분리: AI가 수식 변수와 한글 문장을 같은 $ 안에 묶는 경우
  // e.g. "$dV_w 는 흙 요소의 전체 체적 감소량 dV 와 완벽히 일치해야 합니다.$" 
  //   → "$dV_w$ 는 흙 요소의 전체 체적 감소량 dV 와 완벽히 일치해야 합니다."
  // (분리된 두 번째 $ 는 그 다음 수식 "$dV_w = dV$" 의 여는 기호로 재활용됨)
  text = text.replace(/\$([a-zA-Z_\\][a-zA-Z0-9_{}\\']*(?:_\{?[a-zA-Z0-9_]+\}?)?)\s+([가-힣][^$]*?)\$/g,
    (match, mathPart, koreanPart) => `$${mathPart.trim()}$ ${koreanPart}`
  );

  // $한글텍스트 수식변수$ 패턴 분리 (반대 순서): 
  // e.g. "$흙의 전체 체적 V$" → "흙의 전체 체적 $V$"
  text = text.replace(/\$([가-힣][^$]*?)\s+([a-zA-Z_\\][a-zA-Z0-9_{}\\']*(?:_\{?[a-zA-Z0-9_]+\}?)?)\$/g,
    (match, koreanPart, mathPart) => `${koreanPart} $${mathPart.trim()}$`
  );

  // \text{한글} 형태로 수식 안에 억지로 갇힌 한글 구조 해제
  text = text.replace(/\\text\{\s*([가-힣\s0-9배차]+)\s*\}/g, ' $1 ');

  // 단순 수치 단위가 달러 기호에 묶인 경우 해제 ($10m$ -> 10m)
  text = text.replace(/\$([0-9.,\-\+]+)\s*([가-힣a-zA-Z%]+)\$/g, '$1$2');

  // 전처리 토큰 패스: 텍스트 세그먼트에서만 괄호 내 LaTeX 명령어 래핑
  // e.g. (\sigma_v) -> ($\sigma_v$), (\phi) -> ($\phi$)
  // 기존 $...$ 블록 내부는 건드리지 않음 (text 토큰만 처리)
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


  // 💡 [단일 공식/수식형 전체 감싸기 최적화]
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

  // --- Pre-processing: Clean up syntax errors and fragmented dollars ---

  // 1. 줄 단위로 달러 기호가 1개인 수식 줄(등호가 있는 경우)에서 달러 기호 제거
  const lines = healed.split('\n');
  const processedLines = lines.map(line => {
    const dollarCount = (line.match(/\$/g) || []).length;
    const isFormulaLine = /^[\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}()\[\],.\\\/]*?[<>=]+/.test(line);
    if (dollarCount === 1 && isFormulaLine) {
      return line.replace(/\$/g, '');
    }
    return line;
  });
  healed = processedLines.join('\n');

  // 2. LaTeX 명령어로 시작하지만 달러 기호가 파편화된 수식 복구
  // e.g. \theta = \frac{$\delta}{L}$ -> $\theta = \frac{\delta}{L}$
  healed = healed.replace(/(\r?\n|^)(\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}()\[\],.\\\/]*?)\$([^$\n]*?)\$/g, (match, start, p1, p2) => {
    const hasBackslash = p1.includes('\\') || p2.includes('\\');
    const hasGreek = symbols.some(sym => p1.includes(sym) || p2.includes(sym));
    if (hasBackslash || hasGreek) {
      return start + '$' + p1 + p2 + '$';
    }
    return match;
  });

  // 3. 중괄호 안의 파편화된 달러 기호 제거: \frac{$\delta}{L} -> \frac{\delta}{L}
  healed = healed.replace(/\\frac\s*\{\s*\$([^\$]+?)\}/g, '\\frac{$1}');
  healed = healed.replace(/\{\s*\$([^\$]+?)\s*\}/g, '{$1}');

  // 4. 산술 파편화된 달러 제거: 1$/300$ -> 1/300$
  healed = healed.replace(/(\d+)\s*\$\s*([\/+\-*])\s*(\d+)/g, '$1$2$3');

  // 5. TEXT 토큰에서만 이중 역슬래시 복구
  {
    const rule5Tokens = tokenizeForHealing(healed);
    healed = rule5Tokens.map(tok => {
      if (tok.type !== 'text') return tok.content;
      return tok.content.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
    }).join('');
  }

  // --- Multi-Step Tokenization & Wrapping Architecture ---

  // STEP 1: 텍스트 토큰에서 비교/등식 수식 감싸기
  let tokens = tokenizeForHealing(healed);
  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;

      const formulaPattern = /((?:\\?[a-zA-Z_0-9']+(?:_[a-zA-Z0-9{}]+)?[ \t]*[<>=]+[ \t]*[a-zA-Z0-9'_ \t\-+\/{}\(\)\[\],.\\/<>=:;!?^~&|%]*[a-zA-Z0-9'\)\}]))/g;
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

  // STEP 1.5: 괄호 안의 LaTeX 명령어/그리스 변수 감싸기
  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      t = t.replace(/\(([^)$]*?(?:\\gamma|\\sigma|\\theta|\\phi|\\alpha|\\beta|\\frac|\\delta|\\Delta|_[a-zA-Z0-9{])[^)$]*?)\)/g, (match, p1) => {
        if (p1.includes('\\left') || p1.includes('\\right')) {
          return match;
        }
        if (/[\uAC00-\uD7A3]/.test(p1)) {
          return match;
        }
        return '(

  // STEP 2: 그리스 변수와 첨자 감싸기 (⚠️ mathWords.forEach 루프 제거 - 한글 텍스트 오염 방지)
  let reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);

  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;

      // \sigma, \phi 등 역슬래시가 이미 붙은 그리스 변수만 $...$ 로 감싸기
      const wrapAllowedWords = [
        'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'
      ];
      const subscriptPat = `(?:_[a-zA-Z0-9]+|_(?:\\{[a-zA-Z0-9_]+\\}))?`;
      const greekPattern = new RegExp(`(\\\\\\b(?:${wrapAllowedWords.join('|')})${subscriptPat}(?![a-zA-Z0-9_]))`, 'g');
      t = t.replace(greekPattern, (match, p1) => '$' + p1 + '$');

      // 변수 첨자 패턴 감싸기 (f_{ck}, P_{max} 등)
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

      // 수식 블록 내 이중 역슬래시 복구
      math = math.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
        if (safeLatexCommands.includes(p1)) return '\\' + p1;
        return match;
      });

      token.content = isBlock ? `$$${math}$$` : `$${math}$`;
    }
  });

  // 최종 조립 및 간격 정규화
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
module.exports = { tokenizeForHealing, healLatexFormulas };
