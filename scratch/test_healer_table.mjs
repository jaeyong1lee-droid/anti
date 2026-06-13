// Let's implement the placeholder approach and test it
function healLatexFormulas(text) {
  if (!text || typeof text !== 'string') return text;

  // 1. Extract HTML tables
  const tables = [];
  const tableRegex = /(<\s*table[^>]*>[\s\S]*?<\s*\/\s*table\s*>)/gi;
  let processed = text.replace(tableRegex, (match) => {
    const index = tables.length;
    tables.push(match);
    return ` HTMLTABLEPLACEHOLDERXYZ${index} `;
  });

  // [🔥 치명적 버그 해결] AI의 이중 이스케이프 오류(\\phi -> \phi) 최우선 복구
  processed = processed.replace(/\\{2,}([a-zA-Z]+)/g, '\\$1');

  // Restore LaTeX commands corrupted by JSON escape sequence parsing
  processed = processed.replace(/\x0a\s*eq\b/g, '\\neq')
                       .replace(/\x0a\s*u\b/g, '\\nu')
                       .replace(/\x0a\s*nabla\b/g, '\\nabla')
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

  processed = processed.replace(/(?<!\n)\n(?!\n|\s*(?:###|\*|-|•|\d+\.))/g, ' ');

  processed = processed.replace(/<br\s*\/?>/gi, '\n\n')
                       .replace(/<div[^>]*>\s*[•*]?\s*([^<]+?)\s*<\/div>/gi, '\n\n* $1')
                       .replace(/<\/?(?:div|p|span|li|ul|ol)\b[^>]*>/gi, '')
                       .replace(/\n{3,}/g, '\n\n');

  // Helper tokenize
  function tokenizeForHealing(text) {
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

  function healBackslashes(str) {
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

  const tokens = tokenizeForHealing(processed);
  processed = tokens.map(token => {
    if (token.type === 'text') {
      let t = healBackslashes(token.content);
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

  result = result.replace(/(\$[^\$]+\$)(은|는|이|가|을|를|의|로|으로|에|에서|와|과|도|만|일때|입니다|라하면|값은)/g, '$1 $2');
  result = result.replace(/[ \t]+/g, ' ').trim();

  // 2. Restore [INPUT_n] placeholders (remove accidental math formatting)
  result = result.replace(/\$?\[\s*INPUT_(\d+)\s*\]\$?/gi, '[INPUT_$1]');

  // 3. Restore HTML tables
  for (let i = 0; i < tables.length; i++) {
    const placeholderRegex = new RegExp(`\\s*\\$?HTMLTABLEPLACEHOLDERXYZ${i}\\$?\\s*`, 'g');
    result = result.replace(placeholderRegex, tables[i]);
  }

  return result;
}

const testCase = `다음 표는 연약지반 개량 시 생석회(CaO) 혼합에 따른 점토 지반의 화학적 개량 메커니즘을 나타낸 것입니다. 

빈칸 [INPUT_1], [INPUT_2], [INPUT_3], [INPUT_4] 에 들어갈 내용을 알맞게 서술하시오.

<table border="1">
  <tr>
    <th>구분 항목</th>
    <th>생석회 개량 전 (단가 이온 우세)</th>
    <th>생석회 개량 후 (다가 이온 치환)</th>
  </tr>
  <tr>
    <td>확산이중층 두께 t</td>
    <td>[INPUT_1]</td>
    <td>[INPUT_2]</td>
  </tr>
  <tr>
    <td>점토 입자 구조</td>
    <td>[INPUT_3]</td>
    <td>[INPUT_4]</td>
  </tr>
</table>`;

console.log("=== ORIGINAL ===");
console.log(testCase);

console.log("=== HEALED ===");
const healed = healLatexFormulas(testCase);
console.log(healed);
