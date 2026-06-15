// 1. 수식($), 일반 텍스트, 그리고 보호된 표 블록 분리 (인라인 줄바꿈 오염 방지)
export function tokenizeForHealing(text) {
  if (!text) return [];
  const tokens = [];
  let lastIndex = 0;
  // Match table blocks or inline/display math blocks
  const regex = /(<!--START_TABLE-->[\s\S]*?<!--END_TABLE-->)|(\$\$.*?\$\$)|(\$[^\$\n]{1,1000}\$)/gs;
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

export function htmlTableToMarkdown(html) {
  if (!html) return html;

  // 1. 깨진 공백 및 태그 정제 (시작 태그 및 끝 태그)
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
        cells.push(healLatexFormulas(cellMatch[1].trim(), true));
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

    return `\n\n<!--START_TABLE-->\n${rows.join('\n')}\n<!--END_TABLE-->\n\n`;
  });
}

function parseMarkdownTable(questionText) {
  if (!questionText) return null;
  const lines = questionText.split('\n');
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (startIdx === -1) {
        startIdx = i;
      }
      endIdx = i;
    } else {
      if (startIdx !== -1) {
        break;
      }
    }
  }

  if (startIdx !== -1 && endIdx !== -1 && (endIdx - startIdx) >= 2) {
    const headers = lines[startIdx]
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    
    const separatorLine = lines[startIdx + 1];
    if (separatorLine.includes('---')) {
      const rows = [];
      for (let i = startIdx + 2; i <= endIdx; i++) {
        const rowCells = lines[i]
          .split('|')
          .slice(1, -1)
          .map(cell => cell.trim());
        rows.push(rowCells);
      }
      
      const originalTableText = lines.slice(startIdx, endIdx + 1).join('\n');
      return {
        tableData: { headers, rows },
        originalTableText
      };
    }
  }
  return null;
}

export function wrapMarkdownTables(text) {
  if (!text) return text;
  
  const lines = text.split('\n');
  const resultLines = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.includes('|')) {
      const potentialTableLines = [];
      let j = i;
      while (j < lines.length && lines[j].trim().includes('|')) {
        potentialTableLines.push(lines[j]);
        j++;
      }
      
      if (potentialTableLines.length >= 2) {
        const secondLine = potentialTableLines[1].trim();
        const isSeparator = secondLine.includes('-') && secondLine.includes('|') && /^[\s|:\-]+$/.test(secondLine);
        
        if (isSeparator) {
          resultLines.push('<!--START_TABLE-->');
          resultLines.push(...potentialTableLines);
          resultLines.push('<!--END_TABLE-->');
          i = j;
          continue;
        }
      }
    }
    
    resultLines.push(line);
    i++;
  }
  
  return resultLines.join('\n');
}

function splitEndMath(str) {
  let i = str.length - 1;
  let closeParenCount = 0;
  let closeBracketCount = 0;
  let closeBraceCount = 0;
  
  while (i >= 0) {
    const char = str[i];
    if (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(char) || char === '*' || char === '#') {
      break;
    }
    
    if (char === ')') closeParenCount++;
    else if (char === '(') {
      if (closeParenCount === 0) break;
      closeParenCount--;
    }
    else if (char === ']') {
      closeBracketCount++;
    }
    else if (char === '[') {
      if (closeBracketCount === 0) break;
      closeBracketCount--;
    }
    else if (char === '}') {
      closeBraceCount++;
    }
    else if (char === '{') {
      if (closeBraceCount === 0) break;
      closeBraceCount--;
    }
    
    i--;
  }
  const plain = str.substring(0, i + 1);
  const math = str.substring(i + 1);
  return [plain, math];
}

function splitStartMath(str) {
  let i = 0;
  let openParenCount = 0;
  let openBracketCount = 0;
  let openBraceCount = 0;
  
  while (i < str.length) {
    const char = str[i];
    if (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(char) || char === '*' || char === '#') {
      break;
    }
    
    if (char === '(') openParenCount++;
    else if (char === ')') {
      if (openParenCount === 0) break;
      openParenCount--;
    }
    else if (char === '[') openBracketCount++;
    else if (char === ']') {
      if (openBracketCount === 0) break;
      openBracketCount--;
    }
    else if (char === '{') openBraceCount++;
    else if (char === '}') {
      if (openBraceCount === 0) break;
      openBraceCount--;
    }
    
    i++;
  }
  const math = str.substring(0, i);
  const plain = str.substring(i);
  return [math, plain];
}

export function healMismatchedDollars(text) {
  if (!text || typeof text !== 'string') return text;
  
  const paragraphs = text.split('\n');
  const healedParagraphs = paragraphs.map(para => {
    if (!para.includes('$')) {
      return para;
    }
    
    // Split paragraph by display math blocks ($$) to avoid messing them up
    const parts = para.split(/(\$\$[\s\S]*?\$\$)/g);
    const healedParts = parts.map((part, index) => {
      // Odd indices are the display math blocks (e.g. $$...$$), keep them as-is
      if (index % 2 === 1) {
        return part;
      }
      
      // Even indices are plain text or inline math blocks, apply single-dollar healing
      if (!part.includes('$')) {
        return part;
      }
      
      const segments = part.split(/(?<!\\)\$/);
      if (segments.length <= 1) {
        return part;
      }
      
      let oddPlainCount = 0;
      for (let i = 1; i < segments.length; i += 2) {
        if (/[\uAC00-\uD7A3]/.test(segments[i])) {
          oddPlainCount++;
        }
      }
      
      if (oddPlainCount === 0) {
        return part;
      }
      
      let result = ';
      const n = segments.length - 1;
      
      const [plain0, math0] = splitEndMath(segments[0]);
      result += plain0;
      if (math0.trim()) {
        result += `$${math0.trim()}$`;
      }
      
      for (let i = 1; i < n; i++) {
        if (i % 2 === 1) {
          result += segments[i];
        } else {
          if (segments[i].trim()) {
            result += `$${segments[i].trim()}$`;
          }
        }
      }
      
      if (n % 2 === 0) {
        const [mathN, plainN] = splitStartMath(segments[n]);
        if (mathN.trim()) {
          result += `$${mathN.trim()}$`;
        }
        result += plainN;
      } else {
        result += segments[n];
      }
      
      return result;
    });
    
    return healedParts.join('');
  });
  
  return healedParagraphs.join('\n');
}

// 3. 메인 레이아웃 및 수식 복구 마스터 함수
export function healLatexFormulas(text, isNested = false) {
  if (!text || typeof text !== 'string') return text;

  // 1. Convert HTML tables to Markdown tables (only on outer call)
  let processed = text;
  if (!isNested) {
    processed = healMismatchedDollars(processed);
    processed = htmlTableToMarkdown(processed);
    processed = wrapMarkdownTables(processed);
  }

  // 🟢 [보완 반영 1] 게으른 매칭 및 다른 수식 납치 차단 (글자수 제한 해제)
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
    if (content.includes('$')) {
      return `$${content}$`;
    }
    return match;
  });

  // [🔥 치명적 버그 해결] AI의 이중 이스케이프 오류(\\phi -> \phi) 최우선 복구
  processed = processed.replace(/\\{2,}([a-zA-Z]+)/g, '\\$1');
  // Collapse double or multiple backslashes before % to single backslash
  processed = processed.replace(/\\{2,}%/g, '\\%');

  // Restore LaTeX commands corrupted by JSON escape sequence parsing (e.g. \neq -> \x0a + eq)
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
  // 단, 마크다운 표 영역은 줄바꿈 병합을 하지 않고 원본 철저히 유지하기 위해 split 처리
  const sections = processed.split(/(<!--START_TABLE-->[\s\S]*?<!--END_TABLE-->)/g);
  processed = sections.map(section => {
    if (section.startsWith('<!--START_TABLE-->')) {
      return section; // 표 영역은 줄바꿈 병합을 하지 않고 원본 철저히 유지
    }
    return section.replace(/(?<!\n)\n(?!\n|\s*(?:###|\*|-|•|\d+\.|\d+\)|\$))/g, ' ');
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
      // Remove greedy formulaPattern wrapper and only escape angle brackets for safety
      return t.replace(/</g, '\\lt ').replace(/>/g, '\\gt ');
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

  // 🟢 [보완 반영 2] 공백 허용 + 개행 방지 + 100자 이내 매칭
  result = result.replace(/(\$[^\$\n]{1,100}\$)(은|는|이|가|을|를|의|로|으로|에|에서|와|과|도|만|일때|입니다|라하면|값은)/g, '$1 $2');
  result = result.replace(/[ \t]+/g, ' ').trim();

  // 2. Restore [INPUT_n] placeholders (remove accidental math formatting)
  result = result.replace(/\$?\[\s*INPUT_(\d+)\s*\]\$?/gi, '[INPUT_$1]');

  if (!isNested) {
    result = result.replace(/<!--START_TABLE-->\n?/g, '').replace(/\n?<!--END_TABLE-->/g, '');
  }

  return result;
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

function parseQuestionTableText(questionText) {
  let tableData = null;
  if (!questionText) return { questionText, tableData };

  // 1. Try parsing HTML table
  if (questionText.toLowerCase().includes('<table') || questionText.toLowerCase().replace(/\s+/g, '').includes('<table')) {
    let cleaned = questionText
      .replace(/<\s*table[^>]*>/gi, '<table>')
      .replace(/<\s*\/+\s*table[^>]*>/gi, '</table>')
      .replace(/<\s*tr[^>]*>/gi, '<tr>')
      .replace(/<\s*\/+\s*tr[^>]*>/gi, '</tr>')
      .replace(/<\s*th[^>]*>/gi, '<th>')
      .replace(/<\s*\/+\s*th[^>]*>/gi, '</th>')
      .replace(/<\s*td[^>]*>/gi, '<td>')
      .replace(/<\s*\/+\s*td[^>]*>/gi, '</td>');

    const tableRegex = /<table>([\s\S]*?)<\/table>/i;
    const match = cleaned.match(tableRegex);
    if (match) {
      const tableContent = match[1];
      const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      const headers = [];
      const rows = [];
      
      while ((trMatch = trRegex.exec(tableContent)) !== null) {
        const rowContent = trMatch[1];
        const thRegex = /<th>([\s\S]*?)<\/th>/gi;
        let thMatch;
        const ths = [];
        while ((thMatch = thRegex.exec(rowContent)) !== null) {
          ths.push(thMatch[1].trim());
        }
        if (ths.length > 0) {
          headers.push(...ths);
          continue;
        }
        
        const tdRegex = /<td>([\s\S]*?)<\/td>/gi;
        let tdMatch;
        const tds = [];
        while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
          tds.push(tdMatch[1].trim());
        }
        if (tds.length > 0) {
          rows.push(tds);
        }
      }

      if (rows.length > 0) {
        tableData = {
          headers: headers.length > 0 ? headers : rows[0],
          rows: headers.length > 0 ? rows : rows.slice(1)
        };
        
        const tableStartIdx = questionText.toLowerCase().search(/<\s*table/i);
        const tableEndIdx = questionText.toLowerCase().search(/<\s*\/+\s*table/i);
        if (tableStartIdx !== -1 && tableEndIdx !== -1) {
          const endBracketIdx = questionText.indexOf('>', tableEndIdx);
          if (endBracketIdx !== -1) {
            const originalTableHtml = questionText.substring(tableStartIdx, endBracketIdx + 1);
            questionText = questionText.replace(originalTableHtml, '').trim();
          }
        }
      }
    }
  }

  // 2. Try parsing Markdown table if HTML table parsing wasn't successful/present
  if (!tableData) {
    const mdParsed = parseMarkdownTable(questionText);
    if (mdParsed) {
      tableData = mdParsed.tableData;
      questionText = questionText.replace(mdParsed.originalTableText, '').trim();
    }
  }

  return { questionText, tableData };
}

export function healQuizQuestionObject(q) {
  if (q && typeof q === 'object') {
    if (q.question && (!q.tableData || !q.tableData.headers || !q.tableData.rows)) {
      const parsed = parseQuestionTableText(q.question);
      if (parsed.tableData) {
        q.tableData = parsed.tableData;
        q.question = parsed.questionText;
      }
    }

    // For table subjective fill-in questions, empty out all cell contents 
    // (except headers and row-label column) and turn them into inputs!
    if (q.type === '주관식 (표채우기)' && q.tableData && q.tableData.rows) {
      const { rows } = q.tableData;
      const oldAnswers = q.answers || {};
      const newAnswers = {};
      let inputCount = 1;

      const newRows = rows.map((row) => {
        return row.map((cell, cIdx) => {
          if (cIdx === 0) return cell; // Keep the row label intact

          const inputId = `INPUT_${inputCount}`;
          inputCount++;

          // Extract correct answer:
          let correctAnswer = '';
          const trimmedCell = typeof cell === 'string' ? cell.trim() : '';
          
          if (trimmedCell.includes('[INPUT_')) {
            // It was already an input field. Find its original input number (e.g. [INPUT_1] -> 1)
            const match = trimmedCell.match(/INPUT_(\d+)/i);
            if (match) {
              const origId = `INPUT_${match[1]}`;
              correctAnswer = oldAnswers[origId] || '';
            } else {
              correctAnswer = '';
            }
          } else {
            // It was plain text, so the text itself is the correct answer
            correctAnswer = cell;
          }

          newAnswers[inputId] = correctAnswer;
          return `[${inputId}]`;
        });
      });

      q.tableData.rows = newRows;
      q.answers = newAnswers;
    }
  }
  return healDeep(q);
}
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
6. 분수(\\\\frac), 거듭제곱근(\\\\sqrt), 미분방정식 항이 중첩된 복잡한 전개 수식은 문장 중간에 절대 섞어 쓰지 말고, 반드시 수식 블록 위아래로 빈 줄을 두 칸씩(\\\\n\\\\n) 띄운 뒤 디스플레이 수식 블록($$수식$$)으로 완벽히 독립시켜 독자 단락으로 분리 출력하십시오.
7. 단순 수치나 단위(예: 10m, 20% 등)에는 LaTeX 기호($)를 쓰지 말고 일반 텍스트로 작성하십시오.
8. 수식 내부에서 특수 기호인 '작다' 기호는 \\\\lt 로, '크다' 기호는 \\\\gt 로 표기하여 마크다운 파싱 에러를 원천 차단하십시오.
9. 아래첨자('_')나 괄호 기호 앞에 마크다운 렌더링 충돌 방지라는 핑계로 임의의 역슬래시(\\)를 붙여 시스템 깨짐(₩)을 유발하는 거동을 절대 하지 마십시오.
10. LaTeX 공식 내부 중괄호 내에 한글을 결합하는 \\\\text{한글} 과 같은 행위는 철저히 금지합니다. 한글과 만날 때는 수식을 즉시 닫고 공백을 준 뒤 한글을 배치하십시오. (예: $B$ 가 4배로 증가)
11. 달러 기호($ 또는 $$)는 반드시 수식 전체를 감싸는 가장 바깥쪽에만 위치해야 하며, 중괄호({}) 내부에 달러 기호가 침투하지 않도록 이중 마킹을 엄격히 금지합니다.
12. 🚨 [마크다운 리스트 및 줄바꿈 수칙]: JSON 응답 내에서 항목을 나열하기 위해 리스트 기호(* 또는 -)를 사용할 때는 반드시 기호 뒤에 스페이스(공백)를 한 칸 띄우고 텍스트를 작성하십시오. (예: "* k: 투수계수" (O) / "*k: 투수계수" (X)). 
14. 🚨 [문단 격리 규칙]: JSON 내부의 문자열 항목(concept, explanation, answer 등) 구조에서 새로운 제목(###)이나 번호 매기기(1), 2) 등), 혹은 글머리 기호(*, -)가 시작될 때는, 무조건 그 직전에 진행 중이던 수식을 닫고 줄바꿈 기호 두 개(\\\\n\\\\n)를 삽입하여 일반 텍스트로 완벽하게 단락을 분리하여 작성하십시오. (수식 안에 제목이 들어가서 빨갛게 깨지는 에러 방지용)
13. 문단 구분이나 줄바꿈을 할 때는 프론트엔드 마크다운 렌더러가 텍스트를 한 줄로 뭉개지 않도록 반드시 줄바꿈 기호를 두 번 연속(\\\\n6. 분수(\\\\frac), 거듭제곱근(\\\\sqrt), 미분방정식 항이 중첩된 복잡한 전개 수식은 문장 중간에 절대 섞어 쓰지 말고, 반드시 수식 블록 위아래로 빈 줄을 두 칸씩(\\\\n\\\\n) 띄운 뒤 디스플레이 수식 블록($$수식$$)으로 완벽히 독립시켜 독자 단락으로 분리 출력하십시오.
7. 단순 수치나 단위(예: 10m, 20% 등)에는 LaTeX 기호($)를 쓰지 말고 일반 텍스트로 작성하십시오.
8. 수식 내부에서 특수 기호인 '작다' 기호는 \\\\lt 로, '크다' 기호는 \\\\gt 로 표기하여 마크다운 파싱 에러를 원천 차단하십시오.
9. 아래첨자('_')나 괄호 기호 앞에 임의의 역슬래시(\\)를 붙이지 마십시오.
10. LaTeX 공식 내부 중괄호 내에 한글을 결합하는 \\\\text{한글} 과 같은 행위는 철저히 금지합니다. 한글과 만날 때는 수식을 즉시 닫고 공백을 준 뒤 한글을 배치하십시오. (예: $B$ 가 4배로 증가)
11. 달러 기호($ 또는 $$)는 반드시 수식 전체를 감싸는 가장 바깥쪽에만 위치해야 하며, 중괄호({}) 내부에 달러 기호가 침투하지 않도록 이중 마킹을 엄격히 금지합니다.
12. 🚨 [마크다운 리스트 및 줄바꿈 수칙]: 항목을 나열하기 위해 리스트 기호(* 또는 -)를 사용할 때는 반드시 기호 뒤에 스페이스(공백)를 한 칸 띄우고 텍스트를 작성하십시오. (예: "* k: 투수계수" (O) / "*k: 투수계수" (X)). 
13. 새로운 단락(문단)이나 글머리 기호(*, -), 번호 매기기(1), 2) 등), 또는 제목(###)이 시작될 때는 반드시 그 직전에 진행 중이던 수식을 닫고 줄바꿈 기호 두 개(\\n\\n)를 명시적으로 삽입하십시오. (수식 영역 안에 한글 제목이 납치되는 현상 방지)
14. 문단 구분이나 줄바꿈을 할 때는 프론트엔드 마크다운 렌더러가 텍스트를 한 줄로 뭉개지 않도록 반드시 줄바꿈 기호를 두 번 연속(\\n\\n) 사용하여 명확하게 문단을 분리하십시오.
15. 🚨 [HTML 태그 사용 절대 금지]: 어떠한 경우에도 답변에 <div>, <span>, <strong> 등 임의의 HTML 스타일 태그를 직접 작성하여 주입하지 마십시오. 레이아웃 붕괴를 유발하므로 텍스트 강조 시에는 오직 마크다운 문법(예: **강조**)을 사용하십시오.
16. 🚨 [컨테이너 중첩 절대 금지]: 여러 개의 수식 전개 과정이나 한글 설명 리스트 전체를 하나의 거대한 디스플레이 수식 블록($$...$$)으로 통째로 감싸지 마십시오. 각 공식은 개별적으로 $ 기호나 $$ 기호로 묶어야 합니다.
17. 🚨 [달러 기호 매칭 오류 및 이탈 방지 규칙]: 번호 매기기(예: "1) 연성 벽체...", "2) 고강성...")가 포함된 문단 내에서 공식들을 나열할 때, 각 공식들은 개별적으로 완벽히 수식 기호($ 또는 $$)로 열고 닫혀 있어야 합니다. 여는 수식 기호 없이 닫는 수식 기호만 배치하거나, 한글 제목이 수식 영역 안으로 빨려 들어가지 않도록 극도로 유의하십시오. (예: "$d_{H,max1} = ...$ \\n\\n 2) 고강성 ... : \\n\\n $d_{H,max2} = ...$" (O - 올바른 격리 및 표기))
`;�� 전체가 수식 영역 안으로 빨려 들어가지 않도록 극도로 유의하십시오. (예: "d_{H,max1} = ... $ 2) 고강성 ... :$ d_{H,max2} ..." (X - 절대 금지, 2번 제목이 수식 영역에 납치됨) -> "$d_{H,max1} = ...$ \\n\\n 2) 고강성 ... : \\n\\n $d_{H,max2} = ...$" (O - 올바른 격리 및 표기))

[원시 JSON 출력 엄격 준수 규칙]
- JSON 구조 내부의 문자열에 LaTeX 수식을 작성할 때, 백슬래시(\\) 기호는 JSON 문법 표준에 의거하여 반드시 두 번 겹친 이스케이프 형태('\\\\frac', '\\\\alpha')로만 출력해야 합니다. 
- 절대로 단일 백슬래시('\\frac') 형태로 가공되지 않은 원시 문자열을 JSON 내부에 주입하여 문법 에러(Cartesian/Escape Syntax Error)를 유발하지 마십시오.

[JSON String Escape Rule]:
When generating LaTeX formulas inside a JSON string, you must strictly escape the backslash twice (e.g., "\\\\frac", "\\\\alpha") to ensure that the response remains perfectly valid for native JSON.parse() without crashing the backend system.

[🚨 수학적/산술적 검증 및 모순 방지 규칙 - 극도로 중요!]:
- 객관식 문제 출제 시, 정답("answer")으로 지정하는 값은 반드시 해설("explanation")에서 풀이하여 유도한 최종 계산값과 완벽하게 일치해야 합니다.
- 수식 계산(예: 비례 관계, 제곱근 계산 등)을 수행할 때는 종이에 적듯 단계별로 산술적 검증을 한 뒤, 최종 정답값의 보기(options) 문자열이 "answer" 필드에 오타 없이 똑같이 들어가도록 하십시오.
- 예를 들어 해설에서 '1/4배(0.25배)가 된다'고 올바르게 풀이해 놓고, 정답 필드("answer")에 '0.125배' 같은 엉뚱한 값을 세팅하는 논리적 모순/환각을 절대 저지르지 마십시오.
`;

export const LATEX_CHAT_PROMPT_INSTRUCTIONS = `
[🚨 극도로 중요한 LaTeX 수식 및 마크다운 렌더링 절대 준수 수칙]:
0. 🚨 [절대 금지 - JSON 응답 금지]: 당신은 실시간 대화형 챗봇/해설사이므로 절대로 JSON 형식(예: {"concept": "...", "explanation": "..."})으로 응답을 감싸서 출력하지 마십시오. 중괄호({ })나 큰따옴표가 들어간 JSON 키-값 구조는 렌더링 오류를 발생시킵니다. 오직 일반적인 한글 대화 문장 및 마크다운 포맷으로만 직접 답변하십시오.
1. 모든 수학 공식 및 개별 물리/공학 변수 기호(예: $K_s$, $k_h$, $e$, $c$, \phi, \sigma, \tau, $u$, $z_c$, $F.S.$ 등)는 단독 문장 혹은 보기, 해설 내에 노출될 때도 무조건 인라인 LaTeX 기호 포맷인 $변수명$ 형태로 감싸서 출력하십시오. 날것의 텍스트 표기(예: \gamma_w)는 엄격히 금지합니다. 반드시 $\gamma_w$ 와 같이 감싸십시오. 답변에도 수식을 적극적으로 활용하되 반드시 기호로 감싸야 합니다.
2. 모든 LaTeX 명령어의 역슬래시(\)는 단일 역슬래시(\frac, \sigma)로 작성하십시오. (※ JSON이 아닌 일반 마크다운 출력이므로 이중 역슬래시가 아닌 단일 역슬래시로 출력해야 정상 렌더링됩니다.)
3. 인라인 수식 작성 시 $ 기호와 수식 내용 사이에 절대 공백(스페이스)을 두지 마십시오. (예: $수식$ (O) / $ 수식 $ (X))
4. 외부 공백 필수 조건: $ 기호의 앞과 뒤가 한글, 숫자, 문장 부호와 맞닿을 경우 반드시 앞뒤로 '한 칸의 공백(스페이스)'을 명시적으로 두어 격리하십시오. 한국어 조사('가', '는', '입니다' 등)와 결합할 때도 예외 없이 한 칸 띄우고 조사를 작성하십시오. (예: $B$ 가 4배로 증가 (O) / $B$가 4배로 증가 (X))
5. 인라인 수식 내 줄바꿈 절대 금지: 문장 중간의 $ 기호 사이 내용에서는 엔터(줄바꿈)를 절대 하지 말고 단일 줄로 이어서 작성하십시오.
6. 분수(\\frac), 거듭제곱근(\\sqrt), 미분방정식 항이 중첩된 복잡한 전개 수식은 문장 중간에 절대 섞어 쓰지 말고, 반드시 수식 블록 위아래로 빈 줄을 한 칸씩 띄운 뒤 디스플레이 수식 블록($$\text{수식}$$)으로 완벽히 독립시켜 독자 단락으로 분리 출력하십시오.
7. 단순 수치나 단위(예: 10m, 20% 등)에는 LaTeX 기호($)를 쓰지 말고 일반 텍스트로 작성하십시오.
8. 수식 내부에서 특수 기호인 '작다' 기호는 \\lt 로, '크다' 기호는 \\gt 로 표기하여 마크다운 파싱 에러를 원천 차단하십시오.
9. 아래첨자('_')나 괄호 기호 앞에 임의의 역슬래시(\)를 붙이지 마십시오.
10. LaTeX 공식 내부 중괄호 내에 한글을 결합하는 \\text{한글} 과 같은 행위는 철저히 금지합니다. 한글과 만날 때는 수식을 즉시 닫고 공백을 준 뒤 한글을 배치하십시오. (예: $B$ 가 4배로 증가)
11. 달러 기호($ 또는 $$)는 반드시 수식 전체를 감싸는 가장 바깥쪽에만 위치해야 하며, 중괄호({}) 내부에 달러 기호가 침투하지 않도록 이중 마킹을 엄격히 금지합니다.
12. 🚨 [마크다운 리스트 및 줄바꿈 수칙]: 항목을 나열하기 위해 리스트 기호(* 또는 -)를 사용할 때는 반드시 기호 뒤에 스페이스(공백)를 한 칸 띄우고 텍스트를 작성하십시오. (예: "* k: 투수계수" (O) / "*k: 투수계수" (X)). 
13. 새로운 단락(문단)이나 글머리 기호(*, -), 번호 매기기(1), 2) 등), 또는 제목(###)이 시작될 때는 반드시 그 직전에 진행 중이던 수식을 닫고 줄바꿈 기호 두 개(\n\n)를 명시적으로 삽입하십시오. (수식 영역 안에 한글 제목이 납치되는 현상 방지)
14. 문단 구분이나 줄바꿈을 할 때는 프론트엔드 마크다운 렌더러가 텍스트를 한 줄로 뭉개지 않도록 반드시 줄바꿈 기호를 두 번 연속(\n\n) 사용하여 명확하게 문단을 분리하십시오.
15. 🚨 [HTML 태그 사용 절대 금지]: 어떠한 경우에도 답변에 <div>, <span>, <strong> 등 임의의 HTML 스타일 태그를 직접 작성하여 주입하지 마십시오. 레이아웃 붕괴를 유발하므로 텍스트 강조 시에는 오직 마크다운 문법(예: **강조**)을 사용하십시오.
16. 🚨 [표(Table) 작성 철칙]: 답변 중 지표, 수치 비교, 매개변수 정리 등 표(Table) 형태의 데이터 표현이 필요한 경우, HTML이나 LaTeX tabular/matrix/array 환경을 사용하지 말고 반드시 표준 **마크다운 표(Markdown Table)** 형식(| 열1 | 열2 |과 구분선 | --- | --- |)으로만 작성하십시오.
17. 🚨 [컨테이너 중첩 절대 금지]: 여러 개의 수식 전개 과정이나 한글 설명 리스트 전체를 하나의 거대한 디스플레이 수식 블록($$...$$)으로 통째로 감싸지 마십시오. 반드시 개별 공식마다 독립된 $ 기호만 사용하십시오.
18. 🚨 [달러 기호 매칭 오류 및 이탈 방지 규칙]: 리스트 기호나 숫자가 포함된 번호 매기기(예: "1) 연성 벽체...", "2) 고강성...")가 포함된 문단 내에서 공식들을 나열할 때, 각 공식들은 개별적으로 완벽히 수식 기호($)로 열고 닫혀 있어야 합니다. 절대로 여는 수식 기호가 없는 상태에서 닫는 수식 기호만 배치하거나, 혹은 어설프게 매칭되어 한글 제목 전체가 수식 영역 안으로 빨려 들어가지 않도록 극도로 유의하십시오. (예: "d_{H,max1} = ... $ 2) 고강성 ... :$ d_{H,max2} ..." (X - 절대 금지, 2번 제목이 수식 영역에 납치됨) -> "$d_{H,max1} = ...$ 2) 고강성 ... : $d_{H,max2} = ...$" (O - 올바른 격리 및 표기))

`;
