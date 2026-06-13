const questionText = `다음 표는 동일한 점토 광물로 구성된 두 지반 X 와 Y 의 간극수 화학적 특성을 나타낸 것이다. Gouy – Chapman 이론에 근거하여 이중층 두께 t 와 지반공학적 특성 변화를 올바르게 설명한 것은 무엇인가? < tableborder = "1"style = "border – collapse: collapse; width: 100%; text – align: center;">< tr >< thstyle = "padding: 8px;">구분 < /th >< thstyle = "padding: 8px;">점토 지반 X < /th >< thstyle = "padding: 8px;">점토 지반 Y < /th >< /tr >< tr >< tdstyle = "padding: 8px;">퇴적 환경 < /td >< tdstyle = "padding: 8px;">해수 환경 (고농도 전해질 ) < /td >< tdstyle = "padding: 8px;">담수 환경 (저농도 전해질 ) < /td >< /tr >< tr >< tdstyle = "padding: 8px;">주요 양이온 < /td >< tdstyle = "padding: 8px;">다가 이온 (Ca^{2+} ) < /td >< tdstyle = "padding: 8px;">단가 이온 (Na^{+} ) < /td >< /tr >< /table >`;

function tokenizeForHealing(text) {
  if (!text) return [];
  const tokens = [];
  let lastIndex = 0;
  // Match table blocks or inline/display math blocks
  const regex = /(<!--START_TABLE-->[\s\S]*?<!--END_TABLE-->)|(\$\$.*?\$\$)|(\$[^\$\n]{1,200}\$)/gs;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const before = text.substring(lastIndex, match.index);
    if (before) tokens.push({ type: 'text', content: before });
    
    const content = match[0];
    if (content.startsWith('<!--START_TABLE-->')) {
      tokens.push({ type: 'table', content });
    } else {
      tokens.push({
        type: content.startsWith('$$') ? 'block-math' : 'inline-math',
        content
      });
    }
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

function htmlTableToMarkdown(html) {
  if (!html) return html;

  // 1. 깨진 공백 및 태그 정제 (opening and closing tags)
  let cleanHtml = html
    .replace(/<\s*table[^>]*>/gi, '<table>')
    .replace(/<\s*\/+\s*table[^>]*>/gi, '</table>')
    .replace(/<\s*tr[^>]*>/gi, '<tr>')
    .replace(/<\s*\/+\s*tr[^>]*>/gi, '</tr>')
    .replace(/<\s*th[^>]*>/gi, '<th>')
    .replace(/<\s*\/+\s*th[^>]*>/gi, '</th>')
    .replace(/<\s*td[^>]*>/gi, '<td>')
    .replace(/<\s*\/+\s*td[^>]*>/gi, '</td>');

  // 2. 정규식을 이용해 <table> 블록 전체 포착 후 마크다운 구조로 빌드
  return cleanHtml.replace(/<table>([\s\S]*?)<\/table>/gi, (match, tableContent) => {
    const rows = [];
    const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    let hasHeader = false;

    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const rowContent = trMatch[1];
      const cells = [];
      
      const cellRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/\s*(?:th|td)>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        // Heal cell content inline!
        const healedCell = healLatexFormulas(cellMatch[1].trim(), true);
        cells.push(healedCell);
      }
      
      if (cells.length > 0) {
        rows.push(`| ${cells.join(' | ')} |`);
        if (rowContent.includes('<th')) hasHeader = true;
      }
    }

    if (rows.length === 0) return '';

    const colCount = rows[0].split('|').length - 2;
    const separator = `| ${Array(colCount).fill('---').join(' | ')} |`;

    if (hasHeader) {
      rows.splice(1, 0, separator);
    } else {
      rows.unshift(`| ${Array(colCount).fill(' ').join(' | ')} |`);
      rows.splice(1, 0, separator);
    }

    // Wrap the table in special block comments so we can isolate it from newline merging and other general text replacements.
    return `\n\n<!--START_TABLE-->\n${rows.join('\n')}\n<!--END_TABLE-->\n\n`;
  });
}

function healLatexFormulas(text, isNested = false) {
  if (!text || typeof text !== 'string') return text;

  let processed = text;
  if (!isNested) {
    processed = htmlTableToMarkdown(processed);
  }

  // [🔥 치명적 버그 해결] AI의 이중 이스케이프 오류(\\phi -> \phi) 최우선 복구
  processed = processed.replace(/\\{2,}([a-zA-Z]+)/g, '\\$1');

  // Restore LaTeX commands corrupted by JSON escape sequence parsing
  processed = processed.replace(/\x0a\s*eq\b/g, '\\neq')
                       .replace(/\x0a\s*nu\b/g, '\\nu')
                       .replace(/\x0a\s*nabla\b/g, '\\nabla')
                       .replace(/\x0a\s*nearrow\b/g, '\\nearrow')
                       .replace(/\x0a\s*neg\b/g, '\\neg')
                       .replace(/\x0a\s*ni\b/g, '\\ni')
                       .replace(/\x0a\s*notin\b/g, '\\notin')
                       .replace(/\x0a\s*ngeq\b/g, '\\ngeq')
                       .replace(/\x0a\s*nleq\b/g, '\\nleq')
                       .replace(/\x0a\s*nsim\b/g, '\\nsim')
                       .replace(/\x0a\s*ncong\b/g, '\\ncong')
                       .replace(/\x0a\s*nparallel\b/g, '\\nparallel')
                       .replace(/\x0a\s*newline\b/g, '\\newline')
                       .replace(/\x0a\s*noindent\b/g, '\\noindent');

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

  // 문장 한복판에 쪼개진 단일 줄바꿈(\n)을 공백으로 자동 병합 (수식 끊김 방지)
  // 단, 마크다운 표 영역은 줄바꿈 병합을 하지 않고 원본 철저히 유지하기 위해 split 처리
  const sections = processed.split(/(<!--START_TABLE-->[\s\S]*?<!--END_TABLE-->)/g);
  processed = sections.map(section => {
    if (section.startsWith('<!--START_TABLE-->')) {
      return section; // 표 영역은 줄바꿈 병합을 하지 않고 원본 철저히 유지
    }
    return section.replace(/(?<!\n)\n(?!\n|\s*(?:###|\*|-|•|\d+\.))/g, ' ');
  }).join('');

  // 불필요한 HTML 태그 정제
  processed = processed.replace(/<br\s*\/?>/gi, '\n\n')
                       .replace(/<div[^>]*>\s*[•*]?\s*([^<]+?)\s*<\/div>/gi, '\n\n* $1')
                       .replace(/<\/?(?:div|p|span|li|ul|ol)\b[^>]*>/gi, '')
                       .replace(/\n{3,}/g, '\n\n');

  const tokens = tokenizeForHealing(processed);
  processed = tokens.map(token => {
    if (token.type === 'table') {
      return token.content; // Skip healing on the table structure itself!
    }
    if (token.type === 'text') {
      let t = healBackslashes(token.content);
      
      const htmlCssBlacklist = [
        'margin', 'padding', 'display', 'width', 'height', 'color', 'background', 
        'font', 'border', 'position', 'static', 'absolute', 'relative', 'overflow',
        'box-sizing', 'transform', 'none', 'auto', 'important', 'solid', 'px', 'em', 'rem',
        'script', 'style', 'class', 'id', 'div', 'span', 'table', 'html', 'body'
      ];

      const formulaPattern = /([a-zA-Z0-9_\-\+\/()\[\]\{\} \t=<>\\.,\^·~']{3,})/g;
      return t.replace(formulaPattern, (match) => {
        const trimmed = match.trim();
        if (/^[a-zA-Z0-9\s]+$/.test(trimmed) || trimmed.startsWith('$')) return match;
        
        const isHtmlNoise = htmlCssBlacklist.some(noise => trimmed.toLowerCase().includes(noise));
        if (isHtmlNoise) return match;
        
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

  result = result.replace(/(\$[^\$]+\$)(은|는|이|가|을|를|의|로|으로|에|에서|와|과|도|만|일때|입니다|라하면|값은)/g, '$1 $2');
  result = result.replace(/[ \t]+/g, ' ').trim();
  result = result.replace(/\$?\[\s*INPUT_(\d+)\s*\]\$?/gi, '[INPUT_$1]');

  // Remove table identifiers before returning (but keep the markdown newlines intact)
  if (!isNested) {
    result = result.replace(/<!--START_TABLE-->\n?/g, '').replace(/\n?<!--END_TABLE-->/g, '');
  }

  return result;
}

console.log("=== FINAL RESULT ===");
console.log(healLatexFormulas(questionText));
