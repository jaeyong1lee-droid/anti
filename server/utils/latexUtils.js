// Self-Healing LaTeX Formula Post-Processor to automatically repair missing backslashes and math delimiters ($...$)

export function tokenizeForHealing(text) {
  const tokens = [];
  let lastIndex = 0;
  // Use [^\$\n] to prevent inline math from matching across newlines
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

export function healLatexFormulas(text) {
  if (!text) return text;

  // ── K0, K_0, k0 관련 문자열 깨짐 및 달러 기호 꼬임 방지 선제 조치 ──
  text = text.replace(/\$현장의\$K_0\$응력\$/g, '현장의 $K_0$ 응력');
  text = text.replace(/\$현장의\$K_0\$/g, '현장의 $K_0$');
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
    text = text.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
      if (safeLatexCommands.includes(p1)) return '\\' + p1;
      return match;
    });

    text = text.replace(/\\text\{\s*([가-힣]+)\s*\}/g, ' $1 ');
    text = text.replace(/\$([0-9.,]+)([가-힣]+)\$/g, '$1$2');
    text = text.replace(/\$([0-9.,]+)\s+([가-힣]+)\$/g, '$1 $2');
    text = text.replace(/([가-힣:])(\\[a-zA-Z]+)/g, '$1 $2');
    text = text.replace(/([a-zA-Z0-9_])\$(\})/g, '$1$2$');
    text = text.replace(/\$(\})/g, '$1$');
  }
  
  text = text.replace(/\$([가-힣]{1,10})\$/g, '$1');

  // 외곽 한글 포함 달러 기호 오염 방지
  text = text.replace(/\$\$([^$]+?)\$\$/g, (match, content) => {
    if (/[\uAC00-\uD7A3]/.test(content)) return content;
    return match;
  });
  text = text.replace(/\$([^$]+?)\$/g, (match, content) => {
    if (/[\uAC00-\uD7A3]/.test(content)) return content;
    return match;
  });
  
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
    const hasBackslash = p1.includes('\\');
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

  // STEP 1: 예전 코딩의 검증된 수식 패턴 정규식으로 복구 (Contrast 이물질 단어 제거 완료)
  const formulaPattern = /((?:\\?[a-zA-Z_0-9']+(?:_[a-zA-Z0-9{}]+)?\s*[<>=]+\s*[a-zA-Z0-9_'\s\-+\/{}\(\)\[\],.\\\\/=<>:;!?^~&|%]*[a-zA-Z0-9'\)\}]))/g;
  let tokens = tokenizeForHealing(healed);
  tokens.forEach(tok => {
    if (tok.type === 'text') {
      tok.content = tok.content.replace(formulaPattern, (match, g1) => {
        const hasBackslash = g1.includes('\\');
        const hasGreek = symbols.some(sym => g1.includes(sym));
        const hasMathContext = /[<>=]/.test(g1) && (hasBackslash || hasGreek || /\b[cuq]\b/.test(g1));
        if (hasBackslash || hasGreek || hasMathContext) {
          let content = g1.trim();
          if (content.endsWith('\\')) content = content.slice(0, -1).trim();
          const isComplex = content.includes('\\frac') || content.includes('\\log') || content.length > 40;
          return isComplex ? '$$' + content + '$$' : '$' + content + '$';
        }
        return match;
      });
      tok.content = tok.content.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
      tok.content = tok.content.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*u)/g, (match, p1) => '$' + p1 + '$');
      tok.content = tok.content.replace(/(\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
    }
  });
  healed = tokens.map(t => t.content).join('');

  // STEP 2: 백슬래시 수식 감지 래핑
  const mathExprPattern = /((?:\b[a-zA-Z0-9_\-\+\*\/\(\)\[\] \t=<>]*)?\\[a-zA-Z_]+(?:[a-zA-Z0-9_\-\+\*\/\(\)\[\|\ ']|[ \t=<>\\\\\^]|\{[^}]*\})*)/g;
  tokens = tokenizeForHealing(healed);
  tokens.forEach(tok => {
    if (tok.type === 'text') {
      tok.content = tok.content.replace(mathExprPattern, (match, g1) => {
        let content = g1.trim();
        if (content.endsWith('\\')) content = content.slice(0, -1).trim();
        const isComplex = content.includes('\\frac') || content.includes('\\partial') || content.length > 40;
        return isComplex ? '$$' + content + '$$' : '$' + content + '$';
      });
    }
  });
  healed = tokens.map(t => t.content).join('');

  // STEP 3: 괄호 내 미해제 수식 해소
  tokens = tokenizeForHealing(healed);
  tokens.forEach(tok => {
    if (tok.type === 'text') {
      let t = tok.content;
      t = t.replace(/\(([^)$]*?(?:\\gamma|\\sigma|\\theta|\\phi|\\alpha|\\beta|\\frac|\\delta|\\Delta|_[a-zA-Z0-9{])[^)$]*?)\)/g, (match, p1) => {
        if (p1.includes('\\left') || p1.includes('\\right') || /[\uAC00-\uD7A3]/.test(p1)) {
          return match;
        }
        return '($' + p1.trim() + '$)';
      });
      tok.content = t;
    }
  });
  healed = tokens.map(t => t.content).join('');

  // STEP 4: 그리스 단독 변수 인라인화 보정
  tokens = tokenizeForHealing(healed);
  tokens.forEach(tok => {
    if (tok.type === 'text') {
      let t = tok.content;
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

      tok.content = t;
    }
  });
  healed = tokens.map(t => t.content).join('');

  // STEP 5: 흙의 단위중량 변수 정리 및 인라인 수식 비대칭 버그 수정 완료
  tokens = tokenizeForHealing(healed);
  tokens.forEach(tok => {
    if (tok.type !== 'text') {
      let inside = tok.content;
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

      // [수정] 인라인 수식 앞뒤 달러 매칭 정상화 ($ 와 $ 대칭 완비)
      tok.content = isBlock ? `$$${math}$$` : `$${math}$`;
    }
  });
  healed = tokens.map(t => t.content).join('');

  // STEP 6: 수식 기호 정밀 클리닝 및 외부 공백 가독성 마감
  const finalTokens = tokenizeForHealing(healed);
  finalTokens.forEach(token => {
    if (token.type === 'inline-math') {
      let inside = token.content.substring(1, token.content.length - 1).trim();
      inside = inside.replace(/\r?\n/g, ' ').trim();
      token.content = `$${inside}$`;
    } else if (token.type === 'block-math') {
      const inside = token.content.substring(2, token.content.length - 2).trim();
      // [수정] 과도하게 파편화되던 디스플레이 수식 진입 기호 정상 자릿수 확보
      token.content = `$$${inside}$$`;
    }
  });

  healed = finalTokens.map(t => t.content).join('');
  healed = healed.replace(/([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])([\(\[\{])/g, '$1 $2');
  healed = healed.replace(/([\)\]\}])([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])/g, '$1 $2');

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
      if (lastChar && !/\s/.test(lastChar)) {
        if (!/[\(\['\"]/.test(lastChar)) {
          needSpace = true;
        }
      }
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && current.type === 'text') {
      const firstChar = current.content[0];
      if (firstChar && !/\s/.test(firstChar)) {
        if (!/[\)\]\}'\"]/.test(firstChar)) {
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

  // 잔여 기호 비대칭 패턴 안전 보정 처리
  result = result.replace(/\$$([^\$\n]+?)\$(?!\$)/g, (match, p1) => {
    if (/[\uAC00-\uD7A3]/.test(p1)) return match;
    return '$' + p1 + '$';
  });
  result = result.replace(/(?<!\$)\$([^\$\n]+?)\$\$/g, (match, p1) => {
    if (/[\uAC00-\uD7A3]/.test(p1)) return match;
    return '$' + p1 + '$';
  });

  // 공식 기호 설명행 사이 빈행 삭제
  result = result.replace(/(^\s*[•\-*\u2022]\s*[^\n]+)\n\s*\n(?=\s*[•\-*\u2022]\s*)/gm, '$1\n');

  return result;
}


export function healQuizQuestionObject(q) {
  if (!q) return q;
  const healed = { ...q };
  if (healed.question) healed.question = healLatexFormulas(healed.question);
  if (healed.answer) healed.answer = healLatexFormulas(healed.answer);
  if (healed.explanation) healed.explanation = healLatexFormulas(healed.explanation);
  if (healed.concept) healed.concept = healLatexFormulas(healed.concept);
  if (healed.formula) healed.formula = healLatexFormulas(healed.formula);
  if (healed.structure) healed.structure = healLatexFormulas(healed.structure);
  if (healed.options && Array.isArray(healed.options)) {
    healed.options = healed.options.map(opt => healLatexFormulas(opt));
  }
  return healed;
}

export function healTheoryQuestionObject(t) {
  if (!t) return t;
  const healed = { ...t };
  if (healed.title !== undefined) healed.title = healLatexFormulas(String(healed.title || '').trim());
  if (healed.concept !== undefined) healed.concept = healLatexFormulas(String(healed.concept || '').trim());
  if (healed.assumptions !== undefined) healed.assumptions = healLatexFormulas(String(healed.assumptions || '').trim());
  if (healed.formula !== undefined) healed.formula = healLatexFormulas(String(healed.formula || '').trim());
  if (healed.answer !== undefined) healed.answer = healLatexFormulas(String(healed.answer || '').trim());
  return healed;
}

export function healFormulaQuestionObject(f) {
  if (!f) return f;
  const healed = { ...f };
  if (healed.title !== undefined) healed.title = healLatexFormulas(String(healed.title || '').trim());
  if (healed.concept !== undefined) healed.concept = healLatexFormulas(String(healed.concept || '').trim());
  if (healed.formula !== undefined) healed.formula = healLatexFormulas(String(healed.formula || '').trim());
  return healed;
}

export function healAnswersheetQuestionObject(a) {
  return healFormulaQuestionObject(a);
}


export const LATEX_PROMPT_INSTRUCTIONS = `
[수식 및 기호 표기 규칙 (LaTeX)]:
1. 모든 수학 공식 및 개별 물리/공학 변수 기호(예: $K_s$, $k_h$, $e$, $c$, $\\phi$, $\\sigma$, $\\tau$, $u$, $z_c$, $F.S.$ 등)는 반드시 인라인 LaTeX 기호($변수명$)로 감싸주십시오.
2. 모든 LaTeX 명령어의 역슬래시(\\)는 JSON 파싱 에러 방지를 위해 반드시 이중 역슬래시(\\\\)로 작성하십시오. (예: \\\\frac{a}{b}, \\\\sigma, \\\\cdot 등)
3. 수식 기호( $ 또는 $$ ) 바로 안쪽에는 공백이 없어야 하며, 수식은 마크다운과 섞이지 않는 단일 덩어리여야 합니다.
4. 단순 수치나 단위(예: 10m, 20% 등)에는 LaTeX 기호($)를 쓰지 말고 일반 텍스트로 작성하십시오.
5. 수식 내부에 한글을 넣기 위한 \\\\text{한글} 사용을 금합니다. 수식 외부에서 표현하십시오. (예: $B$가 4배로 증가)
6. 분수(\\\\frac)나 제곱근(\\\\sqrt)이 포함된 복잡한 수식은 반드시 독립된 행에 디스플레이 수식 블록($$수식$$)으로 분리하여 작성하십시오.
7. 달러 기호($ 또는 $$)는 반드시 수식 전체를 감싸는 가장 바깥쪽에 위치시켜 중괄호 내에 침투하지 않게 하십시오.
`;