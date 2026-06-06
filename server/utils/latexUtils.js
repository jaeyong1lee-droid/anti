// Self-Healing LaTeX Formula Post-Processor to automatically repair missing backslashes and math delimiters ($...$)

export function tokenizeForHealing(text) {
  const tokens = [];
  let lastIndex = 0;
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

// 텍스트 전반의 LaTeX 수식 공백 규칙 강제 정제 함수
export function healLatexFormulas(text) {
  if (!text || typeof text !== 'string') return text;

  let healed = text;

  // 1. Markdown list and header newlines fix
  healed = healed.replace(/([가-힣a-zA-Z0-9\.\,\?!])(\s*)(\* )/g, "$1\n\n$3");
  healed = healed.replace(/([가-힣a-zA-Z0-9\.\,\?!])(\s*)(### )/g, "$1\n\n$3");
  healed = healed.replace(/([가-힣a-zA-Z0-9\.\,\?!])(\s*)(- )/g, "$1\n\n$3");

  // 2. Trailing $ fix
  healed = healed.replace(/(?<!\$)([A-Za-z_0-9\\][A-Za-z_0-9\\=\{\}\^\+\-\*\/ ]*[_\\\^=][A-Za-z_0-9\\=\{\}\^\+\-\*\/ ]*)\$/g, '$$$$$1$$$$');

  const tokens = tokenizeForHealing(healed);
  const processedParts = tokens.map(token => {
    if (token.type === 'inline-math') {
      let core = token.content.substring(1, token.content.length - 1).trim();
      core = core.replace(/\s+/g, '');
      return `$${core}$`;
    }
    if (token.type === 'block-math') {
      return token.content;
    }
    
    let tContent = token.content;
    tContent = tContent.replace(/(?<!\$|\w)(c_v|T_v|m_v|a_v|k_h|k_v|K_a|K_p|K_0|F_s|H_d|RQD|J_n|J_r|J_a|J_w|SRF|N_c|N_q)(?!\$|\w)/g, '$$$$$1$$$$');
    tContent = tContent.replace(/(?<!\$|\w)(\\\\(gamma_w|gamma_d|gamma_t|gamma|alpha|beta|sigma_v|sigma_h|sigma|tau_f|tau|phi|theta|mu|nu|rho))(?!\$|\w)/g, '$$$$$1$$$$');
    
    return tContent;
  });

  let joinedText = processedParts.join('');

  joinedText = joinedText.replace(/([가-힣a-zA-Z0-9\.\,])(\$)/g, '$1 $2');
  joinedText = joinedText.replace(/(\$)([가-힣a-zA-Z0-9])/g, '$1 $2');

  return joinedText;
}
export function healQuizQuestionObject(q) {
  if (!q || typeof q !== 'object') return q;
  
  if (q.question) q.question = healLatexFormulas(q.question);
  if (q.concept) q.concept = healLatexFormulas(q.concept);
  if (q.explanation) q.explanation = healLatexFormulas(q.explanation);
  if (q.answer) q.answer = healLatexFormulas(q.answer);
  if (q.structure) q.structure = healLatexFormulas(q.structure);
  
  if (q.options && Array.isArray(q.options)) {
    q.options = q.options.map(opt => healLatexFormulas(opt));
  }
  return q;
}

export function healTheoryQuestionObject(t) {
  if (!t || typeof t !== 'object') return t;
  if (t.title) t.title = healLatexFormulas(t.title);
  if (t.concept) t.concept = healLatexFormulas(t.concept);
  if (t.assumptions) t.assumptions = healLatexFormulas(t.assumptions);
  if (t.answer) t.answer = healLatexFormulas(t.answer);
  return t;
}

export function healFormulaQuestionObject(f) {
  if (!f || typeof f !== 'object') return f;
  if (f.title) f.title = healLatexFormulas(f.title);
  if (f.formula) f.formula = healLatexFormulas(f.formula);
  if (f.concept) f.concept = healLatexFormulas(f.concept);
  return f;
}

export function healAnswersheetQuestionObject(a) {
  return healTheoryQuestionObject(a); // 공통 규격 연동
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
13. 문단 구분이나 줄바꿈을 할 때는 프론트엔드 마크다운 렌더러가 텍스트를 한 줄로 뭉개지 않도록 반드시 줄바꿈 기호를 두 번 연속(\\\\n\\\\n) 사용하여 명확하게 문단을 분리하십시오.

[원시 JSON 출력 엄격 준수 규칙]
- JSON 구조 내부의 문자열에 LaTeX 수식을 작성할 때, 백슬래시(\\) 기호는 JSON 문법 표준에 의거하여 반드시 두 번 겹친 이스케이프 형태('\\\\frac', '\\\\alpha')로만 출력해야 합니다. 
- 절대로 단일 백슬래시('\\frac') 형태로 가공되지 않은 원시 문자열을 JSON 내부에 주입하여 문법 에러(Cartesian/Escape Syntax Error)를 유발하지 마십시오.

[JSON String Escape Rule]:
When generating LaTeX formulas inside a JSON string, you must strictly escape the backslash twice (e.g., "\\\\frac", "\\\\alpha") to ensure that the response remains perfectly valid for native JSON.parse() without crashing the backend system.
`;