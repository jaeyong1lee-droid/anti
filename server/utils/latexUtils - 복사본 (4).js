// 1. 수식($)과 일반 텍스트 토큰 분리 (인라인 줄바꿈 오염 방지)
export function tokenizeForHealing(text) {
  if (!text) return [];
  const tokens = [];
  let lastIndex = 0;
  const regex = /(\$\$.*?\$\$)|(\$[^\$\n]{1,200}\$)/gs;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const before = text.substring(lastIndex, match.index);
    if (before) tokens.push({ type: 'text', content: before });
    
    const content = match[0];
    tokens.push({
      type: content.startsWith('$$') ? 'block-math' : 'inline-math',
      content
    });
    lastIndex = regex.lastIndex;
  }
  const after = text.substring(lastIndex);
  if (after) tokens.push({ type: 'text', content: after });
  return tokens;
}

// 2. 누락된 백슬래시 일괄 복구
export function healBackslashes(str) {
  if (!str) return str;
  let healed = str;
  healed = healed.replace(/(?<!\\)\b(log|ln)\b/g, '\\$1')
                 .replace(/(?<!\\)\b(log|ln)(?=[pt_0-9])/g, '\\$1 ');

  const keywords = [
    'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega', 'nu',
    'frac', 'dfrac', 'sqrt', 'cdot', 'times', 'div', 'pm', 'infty', 'partial', 'sum', 'int', 'sim',
    'le', 'ge', 'lt', 'gt', 'sin', 'cos', 'tan', 'rightarrow', 'leftarrow', 'circ'
  ];

  keywords.forEach(kw => {
    const regex = new RegExp(`(?<!\\\\)\\b${kw}\\b`, 'g');
    healed = healed.replace(regex, `\\${kw}`);
  });
  return healed;
}

// 3. 메인 레이아웃 및 수식 복구 마스터 함수
export function healLatexFormulas(text) {
  if (!text || typeof text !== 'string') return text;

  // [🔥 치명적 버그 해결] AI의 이중 이스케이프 오류(\\phi -> \phi) 최우선 복구
  let processed = text.replace(/\\{2,}([a-zA-Z]+)/g, '\\$1');

  // Restore LaTeX commands corrupted by JSON escape sequence parsing (e.g. \neq -> \x0a + eq)
  processed = processed.replace(/\x0a\s*eq\b/g, '\\neq')
                       .replace(/\x0a\s*u\b/g, '\\nu')
                       .replace(/\x0a\s*abla\b/g, '\\nabla')
                       .replace(/\x0a\s*earrow\b/g, '\\nearrow')
                       .replace(/\x0a\s*eg\b/g, '\\neg')
                       .replace(/\x0a\s*i\b/g, '\\ni')
                       .replace(/\x0a\s*otin\b/g, '\\notin')
                       .replace(/\x0a\s*geq\b/g, '\\ngeq')
                       .replace(/\x0a\s*leq\b/g, '\\nleq')
                       .replace(/\x0a\s*sim\b/g, '\\nsim')
                       .replace(/\x0a\s*cong\b/g, '\\ncong')
                       .replace(/\x0a\s*parallel\b/g, '\\nparallel')
                       .replace(/\x0a\s*ewline\b/g, '\\newline')
                       .replace(/\x0a\s*oindent\b/g, '\\noindent');

  processed = processed.replace(/\x09\s*heta\b/g, '\\theta')
                       .replace(/\x09\s*au\b/g, '\\tau')
                       .replace(/\x09\s*an\b/g, '\\tan')
                       .replace(/\x09\s*imes\b/g, '\\times')
                       .replace(/\x09\s*ilde\b/g, '\\tilde')
                       .replace(/\x09\s*ext\b/g, '\\text')
                       .replace(/\x09\s*rac\b/g, '\\tfrac')
                       .replace(/\x09\s*riangle\b/g, '\\triangle')
                       .replace(/\x09\s*op\b/g, '\\top')
                       .replace(/\x09\s*o\b/g, '\\to');

  processed = processed.replace(/\x0d\s*ho\b/g, '\\rho')
                       .replace(/\x0d\s*ight\b/g, '\\right')
                       .replace(/\x0d\s*ule\b/g, '\\rule')
                       .replace(/\x0d\s*angle\b/g, '\\rangle')
                       .replace(/\x0d\s*ightarrow\b/g, '\\rightarrow');

  processed = processed.replace(/\x08\s*eta\b/g, '\\beta')
                       .replace(/\x08\s*ar\b/g, '\\bar')
                       .replace(/\x08\s*egin\b/g, '\\begin')
                       .replace(/\x08\s*ullet\b/g, '\\bullet');

  processed = processed.replace(/\x0c\s*rac\b/g, '\\frac')
                       .replace(/\x0c\s*orall\b/g, '\\forall')
                       .replace(/\x0c\s*lat\b/g, '\\flat')
                       .replace(/\x0c\s*rown\b/g, '\\frown');

  // Also handle already space-corrupted "eq" symbols (e.g. "k_x eq k_z" -> "k_x \neq k_z", "k_xeqk_z" -> "k_x \neq k_z")
  const isMathVariable = (str) => {
    if (/^[a-zA-Z0-9]$/.test(str)) return true;
    if (/[\\_^]/.test(str)) return true;
    if (str.startsWith('\\')) return true;
    return false;
  };
  processed = processed.replace(/\b([a-zA-Z0-9_\\'\^]+)\s*eq\s*([a-zA-Z0-9_\\'\^]+)\b/g, (match, p1, p2, offset, string) => {
    if (string[offset - 1] === '\\') {
      return match;
    }
    if (isMathVariable(p1) && isMathVariable(p2)) {
      return `${p1} \\neq ${p2}`;
    }
    return match;
  });

  // 블록 수식($$) 바로 뒤에 공백이나 줄바꿈을 포함하여 단위가 올 경우, 해당 단위를 수식 블록 안의 \text{}로 병합하여 줄바꿈 방지
  processed = processed.replace(/\$\$\s*([\s\S]*?)\s*\$\$\s*(\n*)\s*(kN\/m\\\^2|kN\/m\^2|kN\/m²|kN\/m\\\^3|kN\/m\^3|kN\/m³|t\/m\\\^3|t\/m\^3|t\/m³|kg\/cm\\\^2|kg\/cm\^2|kg\/cm²|kPa|MPa|kN|N|m|cm|mm|m\\\^2|m\^2|m²|m\\\^3|m\^3|m³|g\/cm\\\^3|g\/cm\^3|g\/cm³|kg\/m\\\^3|kg\/m\^3|kg\/m³|%)(?![a-zA-Z0-9가-힣])/gi, (match, math, newlines, unit) => {
    let katexUnit = unit.replace(/\\/g, '');
    if (katexUnit.includes('^')) {
      const parts = katexUnit.split('^');
      katexUnit = `\\text{${parts[0]}}^${parts[1]}`;
    } else if (katexUnit.includes('²')) {
      const base = katexUnit.replace('²', '');
      katexUnit = `\\text{${base}}^2`;
    } else if (katexUnit.includes('³')) {
      const base = katexUnit.replace('³', '');
      katexUnit = `\\text{${base}}^3`;
    } else {
      katexUnit = `\\text{${katexUnit}}`;
    }
    return `$$ ${math.trim()} \\quad ${katexUnit} $$`;
  });

  // 문장 한복판에 쪼개진 단일 줄바꿈(\n)을 공백으로 자동 병합 (수식 끊김 방지)
  processed = processed.replace(/(?<!\n)\n(?!\n|\s*(?:###|\*|-|•|\d+\.))/g, ' ');

  // 불필요한 HTML 태그 정제
  processed = processed.replace(/<br\s*\/?>/gi, '\n\n')
                       .replace(/<div[^>]*>\s*[•*]?\s*([^<]+?)\s*<\/div>/gi, '\n\n* $1')
                       .replace(/<\/?(?:div|p|span|li|ul|ol)\b[^>]*>/gi, '')
                       .replace(/\n{3,}/g, '\n\n');

  const tokens = tokenizeForHealing(processed);
  processed = tokens.map(token => {
    if (token.type === 'text') {
      let t = healBackslashes(token.content);
      
      // 날것의 수식 패턴 자동 포착 및 인라인 감싸기 (별표 * 제외로 마크다운 충돌 방지)
      const formulaPattern = /([a-zA-Z0-9_\-\+\/()\[\]\{\} \t=<>\\.,\^·~']{3,})/g;
      return t.replace(formulaPattern, (match) => {
        const trimmed = match.trim();
        if (/^[a-zA-Z0-9\s]+$/.test(trimmed) || trimmed.startsWith('$')) return match;
        
        const hasMath = /[\\_^{}<>=+\-\/']/.test(trimmed);
        if (hasMath) {
          let sanitized = trimmed.replace(/</g, '\\lt ').replace(/>/g, '\\gt ')
                                 .replace(/_\s+/g, '_').replace(/\^\s+/g, '^');
          return `$${sanitized}$`;
        }
        return match;
      });
    } else {
      let math = token.content.replace(/^\$\$?|\$\$?$/g, '').trim();
      math = healBackslashes(math).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
      math = math.replace(/</g, '\\lt ').replace(/>/g, '\\gt ')
                 .replace(/_\s+/g, '_').replace(/\^\s+/g, '^');
      return token.type === 'block-math' ? `\n\n$$${math}$$\n\n` : `$${math}$`;
    }
  }).join('');

  // 4. 절대 준수 수칙: 토큰 기반 인터페이스 외부 공백 완벽 마킹
  const finalTokens = tokenizeForHealing(processed);
  let result = '';

  for (let i = 0; i < finalTokens.length; i++) {
    const current = finalTokens[i];
    if (i === 0) {
      result += current.content;
      continue;
    }
    const prev = finalTokens[i - 1];
    let needSpace = false;

    if (prev.type === 'text' && current.type !== 'text') {
      const lastChar = prev.content[prev.content.length - 1];
      if (lastChar && !/\s/.test(lastChar) && !/[\(\[\{\'\"]/.test(lastChar)) needSpace = true;
    } else if (prev.type !== 'text' && current.type === 'text') {
      const firstChar = current.content[0];
      if (firstChar && !/\s/.test(firstChar) && !/[\,\.\?\!\)\]\}\:\;\*]/.test(firstChar)) needSpace = true;
    } else if (prev.type !== 'text' && current.type !== 'text') {
      needSpace = true;
    }
    result += needSpace ? ' ' + current.content : current.content;
  }

  // 한국어 조사 결합 어미 공백 규격 조율
  result = result.replace(/(\$[^\$]+\$)(은|는|이|가|을|를|의|로|으로|에|에서|와|과|도|만|일때|입니다|라하면|값은)/g, '$1 $2');
  return result.replace(/[ \t]+/g, ' ').trim();
}

// 오브젝트 딥 힐러 트리구조
export function healDeep(obj, parentKey = null) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    const skipKeys = [
      'title', 'pdf_name', 'pdf_url', 'id', 'topic_id', 'schedule_id', 
      'answersheet_report_id', 'type', 'subtype', 'keywords'
    ];
    if (parentKey && skipKeys.includes(parentKey)) {
      let cleanVal = obj.trim();
      if (cleanVal.startsWith('$') && cleanVal.endsWith('$')) {
        cleanVal = cleanVal.slice(1, -1);
      }
      return cleanVal;
    }
    return healLatexFormulas(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => healDeep(item, parentKey));
  }
  if (typeof obj === 'object') {
    const healed = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        healed[key] = healDeep(obj[key], key);
      }
    }
    return healed;
  }
  return obj;
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
