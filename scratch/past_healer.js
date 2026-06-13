
function healLatexFormulas(text) {
  if (!text) return text;

  // ── [치명적 오류 해결] K0, K_0, k0 관련 문자열 깨짐 및 달러 기호 꼬임 방지 선제 조치 ──
  // 문장 중에 깨져서 들어오거나 뒤섞인 $현장의$K_0$ 혹은 $현장의$K_0$응력$ 구조를 기술사 표준 인라인 LaTeX 서식으로 정상화합니다.
  text = text.replace(/\$현장의\$K_0\$응력\$/g, '현장의 $K_0$ 응력');
  text = text.replace(/\$현장의\$K_0\$/g, '현장의 $K_0$');
  text = text.replace(/K_0응력/g, '$K_0$ 응력');
  
  // 날것의 K0나 k0가 공백 없이 텍스트에 붙어 수식 프로세서를 교란하는 것을 방지
  text = text.replace(/([가-힣])([Kk]0|[Kk]_0)/g, '$1 $2');
  text = text.replace(/([Kk]0|[Kk]_0)([가-힣])/g, '$1 $2');
  // ─────────────────────────────────────────────────────────────────────────────

  // AI의 이중 이스케이프 오류(예: \\frac -> \frac, \\text -> \text) 강제 복구 (조기 반환 처리 전 최우선 수행)
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

    // 🚨 [추가된 로직]: LLM이 강제로 넣은 \text{ 한글 } 패턴 해제
    text = text.replace(/\\text\{\s*([가-힣]+)\s*\}/g, ' $1 ');
    
    // 🚨 [추가된 로직]: $0.50배$, $4배$ 처럼 숫자와 한글이 달러 기호 안에 묶인 경우 강제 분리
    text = text.replace(/\$([0-9.,]+)([가-힣]+)\$/g, '$1$2');
    text = text.replace(/\$([0-9.,]+)\s+([가-힣]+)\$/g, '$1 $2');

    // 🚨 [새로 추가할 로직 1]: 텍스트와 백슬래시 수식이 공백 없이 붙어 있는 경우 강제 분리 (예: 전개됩니다:\frac -> 전개됩니다: \frac)
    text = text.replace(/([가-힣:])(\\[a-zA-Z]+)/g, '$1 $2');

    // 🚨 [새로 추가할 로직 2]: 중괄호 내부에 잘못 갇힌 $ 기호 밖으로 구출 (예: {0.3k_{h1}$}} -> {0.3k_{h1}}$)
    text = text.replace(/([a-zA-Z0-9_])\$([\}]+)/g, '$1$2$');
    text = text.replace(/\$([\}]+)/g, '$1$');
  }
  if (!text) return text;
  
  // 🚨 [추가 조치]: 수식 구분자($) 내부가 순수 한글(공백 없음, 최대 10자)인 오염된 래핑 제거
  text = text.replace(/\$([가-힣]{1,10})\$/g, '$1');

  // 🚨 [추가 조치 2]: 수식 구분자($) 내부가 한글을 포함하고 백슬래시(\)가 없는 오염된 래핑 제거 (예: $따라서...$)
  text = text.replace(/\$\$([^$]+?)\$\$/g, (match, content) => {
    if (/[\uAC00-\uD7A3]/.test(content) && !content.includes('\\')) {
      return content;
    }
    return match;
  });
  text = text.replace(/\$([^$]+?)\$/g, (match, content) => {
    if (/[\uAC00-\uD7A3]/.test(content) && !content.includes('\\')) {
      return content;
    }
    return match;
  });

  // 💡 [단일 공식/수식형 전체 감싸기 최적화]: 단일 공식이나 객관식 보기 등 짧은 수식형 문장은
  // 굳이 잘게 쪼개서 파편화하지 않고, 전체를 단일 $...$ 로 감싸 KaTeX가 한 번에 미려하게 렌더링하도록 합니다.
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
  
  const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'];
  let healed = text;
  if (hasKorean && ((text.trim().startsWith('$$') && text.trim().endsWith('$$')) || (text.trim().startsWith('$') && text.trim().endsWith('$')))) {
    healed = trimmed;
  }

  // --- Pre-processing: Clean up syntax errors and fragmented dollars ---

  // 1. Line-by-line recovery for formulas with a single missing delimiter
  // If a line starts with a formula variable/command and an equals sign, but has exactly one dollar sign,
  // we strip the single dollar sign so that the formulaPattern can wrap the whole equation cleanly.
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

  // 2. Repair formulas starting with LaTeX commands but having fragmented dollars mid-way and at the end
  // e.g. \theta = \frac{$\delta}{L}$ -> $\theta = \frac{\delta}{L}$
  // e.g. \theta = 1$/300$ -> $\theta = 1/300$
  healed = healed.replace(/(\r?\n|^)(\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}\(\)\[\],.\\\\/]*?)\$([^$\n]*?)\$/g, (match, start, p1, p2) => {
    const hasBackslash = p1.includes('\\') || p2.includes('\\');
    const hasGreek = symbols.some(sym => p1.includes(sym) || p2.includes(sym));
    if (hasBackslash || hasGreek) {
      return start + '$' + p1 + p2 + '$';
    }
    return match;
  });

  // 3. Clean up split fractions in curly braces like \frac{$\delta}{L} -> \frac{\delta}{L}
  healed = healed.replace(/\\frac\s*\{\s*\$([^\$]+?)\}/g, '\\frac{$1}');
  healed = healed.replace(/\{\s*\$([^\$]+?)\s*\}/g, '{$1}');

  // 4. Clean up arithmetic split dollars like 1$/300$ -> 1/300$
  healed = healed.replace(/(\d+)\s*\$\s*([\/+\-*])\s*(\d+)/g, '$1$2$3');

  // 5. Clean up double-backslash command names - applied only on TEXT segments to preserve \\  inside valid math blocks
  {
    const rule5Tokens = tokenizeForHealing(healed);
    healed = rule5Tokens.map(tok => {
      if (tok.type !== 'text') return tok.content;
      return tok.content.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
    }).join('');
  }

  // 6. [Moved to STEP 1.5 to protect valid math blocks from global injection]

  // --- Multi-Step Tokenization & Wrapping Architecture ---

  // STEP 1: Wrap larger formulas (equations and specific arithmetic expressions) on text tokens
  let tokens = tokenizeForHealing(healed);
  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;

      // Match and wrap comparison/equality formulas containing greek letters or backslashes
      // We restrict the right-side match to typical mathematical characters, stopping at Korean or markdown formatting
      const formulaPattern = /((?:[\\a-zA-Z0-9_\-\+\(\{\[\'][a-zA-Z_0-9'\{\}\[\]\(\)\+\-\*\/\.\\\\/ \t\^]*(?:_[a-zA-Z0-9{}]+)?[ \t]*[<>=]+[ \t]*[a-zA-Z0-9'_ \t\-+\/{}\(\)\[\],.\\\\/<>=:;!?^~&|%]*[a-zA-Z0-9'\\)\\}]))/g;
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

      // Wrap specific arithmetic equations like \sigma' = \sigma - P_w
      t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
      t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*u)/g, (match, p1) => '$' + p1 + '$');
      t = t.replace(/(\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');

      token.content = t;
    }
  });

  // Re-assemble and re-tokenize after STEP 1 to convert wrapped math blocks into actual math tokens
  let reassembledAfterStep1 = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembledAfterStep1);

  // STEP 1.5: Wrap parenthesized expressions that contain LaTeX commands/Greek variables but lack delimiters
  // e.g. (0.5 \gamma B N_{\gamma}) -> ( $0.5 \gamma B N_{\gamma}$ )
  // Running this only on text tokens prevents injecting $ inside pre-existing math blocks.
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
        return '($' + p1.trim() + '$)';
      });
      token.content = t;
    }
  });

  // STEP 2: Re-tokenize and wrap smaller Greek variables and subscripts
  let reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);

  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;

      // Wrap bare Greek letters and standard math commands with backslashes
      const mathWords = [
        'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
        'frac', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 'tan', 'approx', 'partial'
      ];
      mathWords.forEach(word => {
        const regex = new RegExp(`(?<!\\\\)\\b${word}\\b`, 'g');
        t = t.replace(regex, `\\${word}`);
      });

      // Wrap individual Greek variables like \alpha_p, \alpha_f, \phi
      // 주의: frac, text 등 인자를 받는 명령어는 개별 $ $ 감싸기에서 제외합니다.
      const wrapAllowedWords = [
        'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'
      ];
      const subscriptPattern = `(?:_[a-zA-Z0-9]+|_(?:\\{[a-zA-Z0-9_]+\\}))?`;
      const greekPattern = new RegExp(`(\\\\\\b(?:${wrapAllowedWords.join('|')})${subscriptPattern}(?![a-zA-Z0-9_]))`, 'g');
      t = t.replace(greekPattern, (match, p1) => '$' + p1 + '$');

      // Wrap plain variable subscripts (like f_{ck}, i_{cor}, P_{max}, P_w)
      const plainSubscriptPattern = /((\b[a-zA-Z](?:_[a-zA-Z0-9]+|_(?:\{[a-zA-Z0-9_]+\}))(?![a-zA-Z0-9_])))/g;
      t = t.replace(plainSubscriptPattern, (match, p1) => '$' + p1 + '$');

      token.content = t;
    }
  });

  // STEP 3: Re-tokenize and perform inner math block formatting
  reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);

  tokens.forEach(token => {
    if (token.type !== 'text') {
      let inside = token.content;
      const isBlock = inside.startsWith('$$');
      let math = isBlock 
        ? inside.substring(2, inside.length - 2).trim()
        : inside.substring(1, inside.length - 1).trim();

      // Convert bare 'y' to '\gamma' inside math blocks
      math = math.replace(/\by_([a-zA-Z0-9]+)\b/g, '\\gamma_$1');
      math = math.replace(/\by\s*D_f\b/g, '\\gamma D_f');
      math = math.replace(/\byD_f\b/g, '\\gamma D_f');
      math = math.replace(/\by\s*\\?cdot\b/g, '\\gamma \\cdot');

      // AI의 이중 이스케이프 오류(예: \\frac -> \frac, \\text -> \text) 강제 복구
      const safeLatexCommands = [
        'frac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
        'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
        'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
        'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
        'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
        'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
        'equiv', 'nabla', 'quad', 'qquad', 'max', 'min'
      ];
      math = math.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
        if (safeLatexCommands.includes(p1)) return '\\' + p1;
        return match;
      });

      token.content = isBlock ? `$$${math}$$` : `$${math}$`;
    }
  });

  // Reassemble and perform final spacing formatting
  reassembled = tokens.map(t => t.content).join('');

  // Re-tokenize to ensure perfect spacing
  const finalTokens = tokenizeForHealing(reassembled);

  // Process Rule 1: Remove spaces inside math blocks
  finalTokens.forEach(token => {
    if (token.type === 'inline-math') {
      let inside = token.content.substring(1, token.content.length - 1).trim();
      inside = inside.replace(/\r?\n/g, ' ').trim(); // Replace inner newlines with spaces
      token.content = `$${inside}$`;
    } else if (token.type === 'block-math') {
      const inside = token.content.substring(2, token.content.length - 2).trim();
      token.content = `$$${inside}$$`;
    }
  });

  reassembled = finalTokens.map(t => t.content).join('');
  // Ensure space before/after brackets
  reassembled = reassembled.replace(/([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])([\(\[\{])/g, '$1 $2');
  reassembled = reassembled.replace(/([\)\]\}])([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])/g, '$1 $2');

  // Process Rule 2: Ensure external spacing
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
        if (!/[\)\]\}\'\"]/.test(firstChar)) {
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

  // 🚨 [최종 정리] 3개 이상 중복 생성되거나 잘못 매칭된 달러 기호의 대칭 정상화
  result = result.replace(/\$\$\$(\$?)/g, (match, p1) => '$$' + p1);
  result = result.replace(/\$\$([^\$]+?)\$(?!\$)/g, (match, p1) => '$' + p1 + '$');
  result = result.replace(/(?<!\$)\$([^\$]+?)\$\$/g, (match, p1) => '$' + p1 + '$');

  return result;
}