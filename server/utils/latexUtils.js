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

// 퀴즈 기출 문제 전 필드 보정용 통합 파이프라인
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
  if (healed.title) healed.title = healLatexFormulas(healed.title);
  if (healed.concept) healed.concept = healLatexFormulas(healed.concept);
  if (healed.assumptions) healed.assumptions = healLatexFormulas(healed.assumptions);
  if (healed.answer) healed.answer = healLatexFormulas(healed.answer);
  return healed;
}

export function healFormulaQuestionObject(f) {
  if (!f) return f;
  const healed = { ...f };
  if (healed.title) healed.title = healLatexFormulas(healed.title);
  if (healed.formula) healed.formula = healLatexFormulas(healed.formula);
  if (healed.concept) healed.concept = healLatexFormulas(healed.concept);
  return healed;
}

export function healAnswersheetQuestionObject(a) {
  if (!a) return a;
  const healed = { ...a };
  if (healed.title) healed.title = healLatexFormulas(healed.title);
  if (healed.concept) healed.concept = healLatexFormulas(healed.concept);
  if (healed.assumptions) healed.assumptions = healLatexFormulas(healed.assumptions);
  if (healed.formula) healed.formula = healLatexFormulas(healed.formula);
  if (healed.answer) healed.answer = healLatexFormulas(healed.answer);
  return healed;
}

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

[원시 JSON 출력 엄격 준수 규칙]
- JSON 구조 내부의 문자열에 LaTeX 수식을 작성할 때, 백슬래시(\\) 기호는 JSON 문법 표준에 의거하여 반드시 두 번 겹친 이스케이프 형태('\\\\frac', '\\\\alpha')로만 출력해야 합니다. 
- 절대로 단일 백슬래시('\\frac') 형태로 가공되지 않은 원시 문자열을 JSON 내부에 주입하여 문법 에러(Cartesian/Escape Syntax Error)를 유발하지 마십시오.

[JSON String Escape Rule]:
When generating LaTeX formulas inside a JSON string, you must strictly escape the backslash twice (e.g., "\\\\frac", "\\\\alpha") to ensure that the response remains perfectly valid for native JSON.parse() without crashing the backend system.
`;