import { tokenizeForHealing, healBackslashes } from '../client/src/utils/latexUtils.js';

export function healLatexFormulas(text) {
  if (!text || typeof text !== 'string') return text;

  // [치명적 버그 방지] 이중 이스케이프 선제 복구
  let processed = text.replace(/\\{2,}([a-zA-Z]+)/g, '\\$1');

  // [컴팩트 HTML/MathML/노이즈 제거] 가독성 및 안전성 최적화
  processed = processed
    .replace(/<br\s*\/?>/gi, '\n\n')
    .replace(/<div[^>]*>\s*[•*]?\s*([^<]+?)\s*<\/div>/gi, '\n\n* $1')
    // 모든 형태의 HTML/MathML 태그(역슬래시 포함 찌꺼기)를 한 줄로 안전하게 제거
    .replace(/\\?<\s*\/?\s*(?:div|p|span|li|ul|ol|annotation|semantics|math|strut|mord|class|style|br|mrow|msup|msub|mn|mi|mo)\b[^>]*>/gi, '')
    // 태그가 깨져서 남은 고아 속성 및 잔재 괄호 완전 청소
    .replace(/(?:style|class|span\s*class|spanclass|div\s*style|divstyle|div\s*class|divclass|xmlns|aria\s*-\s*hidden)\s*=\s*["'][^"']*["']/gi, '')
    .replace(/(?:style|class|span\s*class|spanclass|div\s*style|divstyle|div\s*class|divclass|xmlns|aria\s*-\s*hidden)\s*=\s*(?:[a-zA-Z0-9\s\-:;.,#%()_]|formula-scroll-containerpy-1.5)*/gi, '')
    .replace(/(?:style|class|span\s*class|spanclass|div\s*style|divstyle|div\s*class|divclass|xmlns|aria\s*-\s*hidden)\b/gi, '')
    .replace(/\/?(?:div|p|span|li|ul|ol|annotation|semantics|math|strut|mord)\s*\\?>/gi, '')
    .replace(/\\<|\\>/g, '')
    .replace(/\n{3,}/g, '\n\n');

  // 문장 중간의 단일 줄바꿈(\n)을 공백으로 병합 (수식 끊김 방지)
  processed = processed.replace(/(?<!\n)\n(?!\n|\s*(?:###|\*|-|•|\d+\.))/g, ' ');

  // 단독으로 남은 제어 이스케이프 패턴 일괄 보정 (\neq 등)
  processed = processed.replace(/\x0a\s*eq\b/g, '\\neq');
  if (/포아송|poisson/i.test(text)) {
    processed = processed.replace(/\x0a\s*u\b/g, '\\nu');
  }

  // 블록 수식 단위 병합 처리
  processed = processed.replace(/\$\$\s*([\s\S]*?)\s*\$\$\s*(\n*)\s*(kN\/m\\\^2|kN\/m\^2|kN\/m²|kN\/m\\\^3|kN\/m\^3|kN\/m³|kPa|MPa|kN|N|m|mm|%)(?![a-zA-Z0-9가-힣])/gi, (match, math, newlines, unit) => {
    let katexUnit = unit.replace(/\\/g, '').replace('²', '^2').replace('³', '^3');
    if (katexUnit.includes('^')) {
      const parts = katexUnit.split('^');
      katexUnit = `\\text{${parts[0]}}^${parts[1]}`;
    } else {
      katexUnit = `\\text{${katexUnit}}`;
    }
    return `$$ ${math.trim()} \\quad ${katexUnit} $$`;
  });

  const tokens = tokenizeForHealing(processed);
  processed = tokens.map(token => {
    if (token.type === 'text') {
      let t = healBackslashes(token.content);
      const formulaPattern = /([a-zA-Z0-9_\-\+\/()\[\]\{\} \t=<>\\.,\^·~']{3,})/g;
      return t.replace(formulaPattern, (match) => {
        const trimmed = match.trim();
        if (/^[a-zA-Z0-9\s]+$/.test(trimmed) || trimmed.startsWith('$')) return match;
        if (/[\\_^{}<>=+\-\/']/.test(trimmed)) {
          let sanitized = trimmed.replace(/</g, '\\lt ').replace(/>/g, '\\gt ').replace(/_\s+/g, '_').replace(/\^\s+/g, '^');
          return `$${sanitized}$`;
        }
        return match;
      });
    } else {
      let math = token.content.replace(/^\$\$?|\$\$?$/g, '').trim();
      math = healBackslashes(math).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
      math = math.replace(/</g, '\\lt ').replace(/>/g, '\\gt ').replace(/_\s+/g, '_').replace(/\^\s+/g, '^');
      return token.type === 'block-math' ? `\n\n$$${math}$$\n\n` : `$${math}$`;
    }
  }).join('');

  // 4. 절대 준수 수칙: 외부 공백 규격 조율
  const finalTokens = tokenizeForHealing(processed);
  let result = '';

  for (let i = 0; i < finalTokens.length; i++) {
    const current = finalTokens[i];
    if (i === 0) { result += current.content; continue; }
    const prev = finalTokens[i - 1];
    let needSpace = false;

    if (prev.type === 'text' && current.type !== 'text') {
      const lastChar = prev.content[prev.content.length - 1];
      if (lastChar && !/\s/.test(lastChar) && !/[\(\[\{\'\"]/.test(lastChar)) needSpace = true;
    } else if (prev.type !== 'text' && current.type === 'text') {
      const firstChar = current.content[0];
      if (firstChar && !/\s/.test(firstChar) && !/[\,\.\?\!\)\]\}\:\;\*]/.test(firstChar)) {
        needSpace = true;
      }
    } else if (prev.type !== 'text' && current.type !== 'text') {
      needSpace = true;
    }
    result += needSpace ? ' ' + current.content : current.content;
  }

  result = result.replace(/(\$[^\$]+\$)(은|는|이|가|을|를|의|로|으로|에|에서|와|과|도|만|일때|입니다|라하면|값은)/g, '$1 $2');
  return result.replace(/[ \t]+/g, ' ').trim();
}

console.log("=== Testing Final Compact Healer Logic ===");
console.log(healLatexFormulas("포아송비 u 의 물리적 한계는 -1 <= u <= 0.5 이다."));
console.log(healLatexFormulas("만약 a < b 이고 c > d 이면"));
console.log(healLatexFormulas("일축 응력 상태에서 체적 변형률은\\< divstyle = \"height : 0.8rem;\" \\> \\< /div \\>"));
