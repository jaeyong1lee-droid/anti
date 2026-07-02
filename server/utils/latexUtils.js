// 1. 수식($), 일반 텍스트, 그리고 보호된 표 블록 분리 (인라인 줄바꿈 오염 방지)
export function tokenizeForHealing(text) {
  if (!text) return [];
  const tokens = [];
  let lastIndex = 0;
  
  // Match table blocks or inline/display math blocks (matching multiline values cleanly)
  const regex = /(<!--START_TABLE-->[\s\S]*?<!--END_TABLE-->)|(<table>[\s\S]*?<\/table>)|(\$\$[\s\S]*?\$\$)|(\$[^\$]+?\$)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const before = text.substring(lastIndex, match.index);
    if (before) tokens.push({ type: 'text', content: before });
    
    const content = match[0];
    if (content.startsWith('<!--START_TABLE-->') || content.startsWith('<table>')) {
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

export function htmlTableToMarkdown(html, poissonSymbol = null) {
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
        cells.push(healLatexFormulas(cellMatch[1].trim(), true, poissonSymbol));
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
    if (separatorLine.includes('-') && /^[|:\s\-]+$/.test(separatorLine)) {
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

function healMarkdownTable(tableText, poissonSymbol = null) {
  const lines = tableText.split('\n');
  const healedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return line;
    if (trimmed.includes('-') && /^[|:\s\-]+$/.test(trimmed)) return line;
    
    const startsWithPipe = trimmed.startsWith('|');
    const endsWithPipe = trimmed.endsWith('|');
    
    let cells = trimmed.split('|');
    if (startsWithPipe) cells.shift();
    if (endsWithPipe) cells.pop();
    
    const healedCells = cells.map(cell => healLatexFormulas(cell.trim(), true, poissonSymbol));
    
    let resultLine = '';
    if (startsWithPipe) resultLine += '| ';
    resultLine += healedCells.join(' | ');
    if (endsWithPipe) resultLine += ' |';
    
    const leadingSpace = line.match(/^\s*/)[0];
    return leadingSpace + resultLine;
  });
  return healedLines.join('\n');
}

const healCorruptedKatexHtml = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text.replace(/\u200b/g, '');
  
  const cleanAndSplitFormula = (formula) => {
    let clean = formula.trim().replace(/\\+/g, '\\');
    // Decode basic HTML entities inside formula before parsing/splitting
    clean = clean.replace(/&#x27;/g, "'")
                 .replace(/&quot;/g, '"')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&amp;/g, '&');
                 
    // Split by any HTML tags (e.g. </div>, <br>, <a/>)
    const parts = clean.split(/(?:<[^>]+?>)/gi);
    return parts.map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      // Math formula check: has math operators/symbols, and is not pure Korean text
      const isMath = /[\+\-\*\/=_\\^]/.test(trimmed) && !/^[가-힣\s.,:;!]+$/.test(trimmed);
      const hasKorean = /[가-힣]/.test(trimmed);
      if (isMath && !hasKorean) {
        return ` __MATH_FORMULA_START__${trimmed}__MATH_FORMULA_END__ `;
      } else {
        return ` ${trimmed} `;
      }
    }).join(' ');
  };

  // 1. Match any annotation block (normal or space-corrupted) and extract formula
  const annotationRegex = /<\s*annotation[a-z]*\b(?:[^"'>]|"[^"]*"|'[^']*')*?>([\s\S]*?)<\s*\/\s*annotation[a-z]*\s*>/gi;
  cleaned = cleaned.replace(annotationRegex, (match, formula) => {
    return cleanAndSplitFormula(formula);
  });
  
  // 1.5. Match any KaTeX error blocks and extract formula from title attribute
  const errorSpanRegex = /<\s*span\b(?:[^"'>]|"[^"]*"|'[^']*')*?\bclass=["'][^"']*\bkatex-error\b[^"']*["'](?:[^"'>]|"[^"]*"|'[^']*')*?>([\s\S]*?)<\s*\/\s*span\s*>/gi;
  cleaned = cleaned.replace(errorSpanRegex, (match, errContent) => {
    const titleMatch = match.match(/title=["']KaTeX error:\s*([\s\S]*?)["']/i);
    if (titleMatch && titleMatch[1]) {
      return cleanAndSplitFormula(titleMatch[1]);
    }
    return errContent;
  });
  
  // 2. Strip all KaTeX-related HTML tags (allowing space corruption suffixes and prefix spaces)
  // Using quote-safe regex to prevent matching '>' inside attribute values
  const katexTagsRegex = /<\s*\/?\s*(?:div|span|annotation|semantics|math|mrow|msub|msup|mfrac|msqrt|msubsup|mo|mi|mn|mtext|mspace|mstyle|mtd|mtr|mtable)[a-z]*\b(?:[^"'>]|"[^"]*"|'[^']*')*?>/gi;
  cleaned = cleaned.replace(katexTagsRegex, '');
  
  // 3. Restore formula markers with standard dollar signs
  cleaned = cleaned.replace(/__MATH_FORMULA_START__([\s\S]*?)__MATH_FORMULA_END__/g, (match, formula) => {
    return ` $${formula}$ `;
  });
  
  return cleaned;
};

// 3. 메인 레이아웃 및 수식 복구 마스터 함수
export function healLatexFormulas(text, isNested = false, passedPoissonSymbol = null) {
  if (!text || typeof text !== 'string') return text;

  let processed = healCorruptedKatexHtml(text);
  // 1. Convert HTML tables to Markdown tables (only on outer call)
  if (!isNested) {
    processed = htmlTableToMarkdown(processed, passedPoissonSymbol);
    processed = wrapMarkdownTables(processed);
  }

  // 2. Pre-detect Poisson's ratio symbol to scope it correctly
  let poissonSymbol = passedPoissonSymbol;
  if (!poissonSymbol) {
    if (/포아송/i.test(processed)) {
      if (/(?:\b1\s*[-+]\s*(?:2\s*)?u\b|\$u[_']|\$u\$|포아송[^.]{0,20}u)/i.test(processed)) {
        poissonSymbol = 'u';
      }
    }
    if (!poissonSymbol && /포아송|비배수|탄성/i.test(processed)) {
      if (/(?:\b1\s*[-+]\s*(?:2\s*)?v\b|\$v[_']|\$v\$|포아송[^.]{0,20}v)/i.test(processed)) {
        poissonSymbol = 'v';
      }
    }
  }

  // [Step 1: Tokenize]
  const tokens = tokenizeForHealing(processed);

  // [Step 2: Area-Specific Healing]
  const healedTokens = tokens.map(token => {
    if (token.type === 'table') {
      // Tables are healed recursively inside their cells
      return {
        type: 'table',
        content: healMarkdownTable(token.content, poissonSymbol)
      };
    }

    if (token.type === 'text') {
      let t = token.content;
      // Soft cleanup of obsolete HTML tags, keeping single-newlines untouched
      t = t.replace(/<br\s*\/?>/gi, '\n\n')
           .replace(/<div[^>]*>\s*[•*]?\s*([^<]+?)\s*<\/div>/gi, '\n\n* $1')
           .replace(/<\/?(?:div|p|span|li|ul|ol)\b[^>]*>/gi, '')
           .replace(/\n{3,}/g, '\n\n');
      
      // Escape loose inequality brackets for KaTeX safety
      t = t.replace(/</g, '\\lt ').replace(/>/g, '\\gt ');
      
      // Restore input fields
      t = t.replace(/\$?\[\s*INPUT_(\d+)\s*\]\$?/gi, '[INPUT_$1]');

      // Add soft padding for collapsed variable list items if matching
      t = t.replace(/(?<!\n)\s+([–—−-]\s*(?:\$[^\$]+\$|[a-zA-Z0-9_\\\{\\}\$]+)\s*:)/g, '\n$1');

      return { type: 'text', content: t };
    }

    // Math token (inline-math or block-math)
    let math = token.content.replace(/^\$\$?|\$\$?$/g, '').trim();

    // Double escape fixes
    math = math.replace(/\\{2,}([a-zA-Z]+)/g, '\\$1')
               .replace(/\\{2,}%/g, '\\%');

    // JSON Escape restoration
    math = math.replace(/\x0a\s*eq\b/g, '\\neq')
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

    math = math.replace(/\x09\s*heta\b/g, '\\theta')
               .replace(/\x09\s*au\b/g, '\\tau')
               .replace(/\x09\s*an\b/g, '\\tan')
               .replace(/\x09\s*imes\b/g, '\\times')
               .replace(/\x09\s*ilde\b/g, '\\tilde')
               .replace(/\x09\s*ext\b/g, '\\text')
               .replace(/\x09\s*frac\b/g, '\\frac')
               .replace(/\x09\s*riangle\b/g, '\\triangle')
               .replace(/\x09\s*op\b/g, '\\top')
               .replace(/\x09\s*o\b/g, '\\to');

    math = math.replace(/\x0d\s*ho\b/g, '\\rho')
               .replace(/\x0d\s*ight\b/g, '\\right')
               .replace(/\x0d\s*ule\b/g, '\\rule')
               .replace(/\x0d\s*angle\b/g, '\\rangle')
               .replace(/\x0d\s*ightarrow\b/g, '\\rightarrow');

    math = math.replace(/\x08\s*eta\b/g, '\\beta')
               .replace(/\x08\s*ar\b/g, '\\bar')
               .replace(/\x08\s*egin\b/g, '\\begin')
               .replace(/\x08\s*ullet\b/g, '\\bullet');

    math = math.replace(/\x0c\s*rac\b/g, '\\frac')
               .replace(/\x0c\s*orall\b/g, '\\forall')
               .replace(/\x0c\s*lat\b/g, '\\flat')
               .replace(/\x0c\s*rown\b/g, '\\frown');

    // Poisson's ratio symbol healing inside math context
    if (poissonSymbol) {
      math = math.replace(new RegExp(`\\b${poissonSymbol}(_[a-zA-Z0-9])\\b`, 'g'), '\\nu$1')
                 .replace(new RegExp(`\\b${poissonSymbol}'\\b`, 'g'), "\\nu'");
      
      const standaloneRegex = new RegExp(`(?<!\\\\)\\b${poissonSymbol}\\b`, 'g');
      math = math.replace(standaloneRegex, '\\nu');
    }

    // Always-on Poisson's ratio shorthand fixes
    math = math.replace(/(?<=\b1\s*-\s*2\s*)[uv]\b/g, '\\nu')
               .replace(/(?<=\b1\s*\+\s*)[uv]\b/g, '\\nu')
               .replace(/(?<=\b1\s*-\s*)[uv]\b/g, '\\nu');

    // Fix space-corrupted "eq" symbols (e.g. "k_x eq k_z" -> "k_x \neq k_z")
    math = math.replace(/\b([a-zA-Z0-9_\\'\^]+)\s*eq\s*([a-zA-Z0-9_\\'\^]+)\b/g, '$1 \\neq $2');

    // Recover missing backslashes
    math = healBackslashes(math);

    // KaTeX spaces and alignment cleanups
    math = math.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ')
               .replace(/</g, '\\lt ').replace(/>/g, '\\gt ')
               .replace(/_\s+/g, '_').replace(/\^\s+/g, '^');

    // Restore hash tags inside math
    math = math.replace(/#([a-zA-Z]{1,20}(?:_[a-zA-Z0-9]+)?)\b/g, '\\$1');

    // Merge unit symbols attached to blocks if possible
    // (Handled globally or inside assembler. Let's keep it clean here)

    // Elevate inline fractions or sum symbols to block equations (Aesthetic rule 2)
    let type = token.type;
    if (type === 'inline-math' && /\\(frac|dfrac|sum|int|triangle)\b/i.test(math)) {
      type = 'block-math';
    }

    return { type, content: math };
  });

  // [Step 3: Assemble]
  let result = '';
  for (let i = 0; i < healedTokens.length; i++) {
    const current = healedTokens[i];

    if (current.type === 'table') {
      result += current.content;
      continue;
    }

    if (current.type === 'block-math') {
      result = result.trimEnd();
      result += `\n\n$$${current.content}$$\n\n`;
      continue;
    }

    if (current.type === 'inline-math') {
      const prev = healedTokens[i - 1];
      if (prev && prev.type === 'text') {
        const lastChar = prev.content[prev.content.length - 1];
        if (lastChar && !/\s/.test(lastChar) && !/[\(\[\{\'\"]/.test(lastChar)) {
          result += ' ';
        }
      }
      result += `$${current.content}$`;
      continue;
    }

    // Text token assembly
    let textVal = current.content;
    const prev = healedTokens[i - 1];
    if (prev && prev.type === 'inline-math') {
      const firstChar = textVal[0];
      const isKoreanParticle = /^[은는이가을를의로에와과도만]/.test(textVal) || /^(?:입니다|일때|라하면|값은)/.test(textVal);
      
      if (firstChar && !/\s/.test(firstChar)) {
        if (isKoreanParticle) {
          // Attach tightly to particle suffix
        } else if (!/[\,\.\?\!\)\]\}\:\;\*]/.test(firstChar)) {
          result += ' ';
        }
      }
    }
    result += textVal;
  }

  // Post cleanups
  result = result.replace(/[ \t]+/g, ' ');
  if (!isNested) {
    result = result.replace(/(?:<!--|\\lt !--)\s*(?:-\s*)*\s*(?:START|END)_TABLE\s*(?:-\s*)*\s*(?:-->|--\\gt|>|\\gt)\n?/gi, '');
  }

  // Restore legacy KaTeX html block structures if any
  result = result.replace(
    /<\s*(div|span)\b[^>]*?class=["'][^"']*\b(?:formula-scroll-container|katex|inline|katex-display|katex-error)\b[^"']*["'][\s\S]*?<\/\s*\1\s*>/gi,
    (htmlBlock) => {
      const match = htmlBlock.match(/<\s*annotation[^>]*encoding[^>]*>\s*([\s\S]*?)\s*<\/\s*annotation\s*>/i);
      if (match && match[1]) {
        const formula = match[1].trim().replace(/\\+/g, '\\').replace(/&#x27;/g, "'");
        return ` $${formula}$ `;
      }
      return '';
    }
  );

  // [Self-Healing] 공백이 기괴하게 소멸된 KaTeX HTML 블록(divclass, spanclass 등) 감지 및 원격 복구
  result = result.replace(
    /<\s*(div|span)class\b[\s\S]*?<\/\s*\1\s*>/gi,
    (htmlBlock) => {
      const match = htmlBlock.match(/<\s*annotationencoding[^>]*>\s*([\s\S]*?)\s*<\/\s*annotation\s*>/i) ||
                    htmlBlock.match(/<annotation[^>]*?encoding=["']?application\/x-tex["']?[^>]*?>([\s\S]*?)<\/annotation>/i);
      if (match && match[1]) {
        const formula = match[1].trim().replace(/\\+/g, '\\').replace(/&#x27;/g, "'");
        return ` $${formula}$ `;
      }
      return '';
    }
  );

  return result.trim();
}

// 오브젝트 딥 힐러 트리구조
export function healDeep(obj, parentKey = null, context = null) {
  if (obj === null || obj === undefined) return obj;
  
  let currentContext = context;
  if (!currentContext && typeof obj === 'object') {
    try {
      const serialized = JSON.stringify(obj);
      let symbol = null;
      if (/포아송/i.test(serialized)) {
        if (/(?:포아송)[^a-zA-Z0-9$]*\$?u\$?/i.test(serialized) || /\$?u\$?[^a-zA-Z0-9$]*(?:포아송)/i.test(serialized)) {
          symbol = 'u';
        }
      }
      if (!symbol && /포아송|비배수|탄성/i.test(serialized)) {
        if (/(?:포아송|비배수|탄성)[^a-zA-Z0-9$]*\$?v\$?/i.test(serialized) || /\$?v\$?[^a-zA-Z0-9$]*(?:포아송|비배수|탄성)/i.test(serialized)) {
          symbol = 'v';
        }
      }
      currentContext = { poissonSymbol: symbol };
    } catch (e) {
      // ignore
    }
  }

  if (typeof obj === 'string') {
    if (/^(data:image\/|https?:\/\/)/i.test(obj)) {
      return obj;
    }
    const skipKeys = [
      'title', 'pdf_name', 'pdf_url', 'id', 'topic_id', 'schedule_id', 
      'answersheet_report_id', 'type', 'subtype', 'keywords',
      'imageSrc', 'image_src', 'base64Image', 'base64_image',
      'originalId', 'original_id'
    ];
    if (parentKey && skipKeys.includes(parentKey)) {
      let cleanVal = obj.trim();
      if (cleanVal.startsWith('$') && cleanVal.endsWith('$')) {
        cleanVal = cleanVal.slice(1, -1);
      }
      return cleanVal;
    }
    return healLatexFormulas(obj, false, currentContext?.poissonSymbol);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => healDeep(item, parentKey, currentContext));
  }
  if (typeof obj === 'object') {
    const healed = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        healed[key] = healDeep(obj[key], key, currentContext);
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

      // [🚨 주관식 표채우기 지문 빈칸 오표기 보정 로직 🚨]
      // 실제 생성된 빈칸의 개수(INPUT 개수)와 지문(question) 내의 알파벳 빈칸 표시 (A), (B) 등의 개수를 일치시킵니다.
      const numInputs = Object.keys(newAnswers).length;
      if (q.question && numInputs > 0) {
        const alphabet = [];
        for (let i = 0; i < numInputs; i++) {
          alphabet.push(`(${String.fromCharCode(65 + i)})`);
        }
        const replacement = alphabet.join(', ');

        const multiPattern = /\([A-Z]\)(?:\s*(?:,|\s+및|\s+또는|와|과)\s*\([A-Z]\))+/g;
        if (multiPattern.test(q.question)) {
          q.question = q.question.replace(multiPattern, replacement);
        } else if (numInputs > 1) {
          const singlePattern = /\([A-Z]\)/g;
          if (singlePattern.test(q.question)) {
            q.question = q.question.replace(singlePattern, replacement);
          }
        }
      }
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
6. 분수(\\\\frac), 거듭제곱근(\\\\sqrt), 미분방정식 항이 중첩된 복잡한 전개 수식은 문장 중간에 절대 섞어 쓰지 말고, 반드시 수식 블록 위아래로 빈 줄을 한 칸씩 띄운 뒤 디스플레이 수식 블록($$수식$$)으로 완벽히 독립시켜 독자 단락으로 분리 출력하십시오.
7. 단순 수치나 단위(예: 10m, 20% 등)에는 LaTeX 기호($)를 쓰지 말고 일반 텍스트로 작성하십시오.
8. 수식 내부에서 특수 기호인 '작다' 기호는 \\\\lt 로, '크다' 기호는 \\\\gt 로 표기하여 마크다운 파싱 에러를 원천 차단하십시오.
9. 아래첨자('_')나 괄호 기호 앞에 마크다운 렌더링 충돌 방지라는 핑계로 임의의 역슬래시(\\)를 붙여 시스템 깨짐(₩)을 유발하는 거동을 절대 하지 마십시오.
10. LaTeX 공식 내부 중괄호 내에 한글을 결합하는 \\\\text{한글} 과 같은 행위는 철저히 금지합니다. 한글과 만날 때는 수식을 즉시 닫고 공백을 준 뒤 한글을 배치하십시오. (예: $B$ 가 4배로 증가)
11. 달러 기호($ 또는 $$)는 반드시 수식 전체를 감싸는 가장 바깥쪽에만 위치해야 하며, 중괄호({}) 내부에 달러 기호가 침투하지 않도록 이중 마킹을 엄격히 금지합니다.
12. 🚨 [마크다운 리스트 및 줄바꿈 수칙]: JSON 응답 내에서 항목을 나열하기 위해 리스트 기호(* 또는 -)를 사용할 때는 반드시 기호 뒤에 스페이스(공백)를 한 칸 띄우고 텍스트를 작성하십시오. (예: "* k: 투수계수" (O) / "*k: 투수계수" (X)). 
13. 문단 구분이나 설명 단락 간에는 가독성을 위해 적절히 줄바꿈(두 번 엔터 \\n\\n)을 사용하여 단락을 분리하되, 과도하게 세 번 이상의 연속 빈 줄을 남발하지 마십시오.
14. 🚨 [목록 시작 시 줄 띄우기 금지]: 대주제/소주제 구분선이나 콜론으로 끝나는 행(예: "• 주요 가정:", "• 메커니즘:") 바로 다음에 목록 항목(1., 2. 또는 *, - 등)이 올 경우에는 절대로 그 사이에 빈 줄(두 번 엔터 \\n\\n)을 넣지 말고, 단일 줄바꿈(\\n)으로만 연결하여 불필요한 빈 간격이 생기지 않도록 하십시오.
15. 🚨 [HTML 태그 사용 절대 금지]: 어떠한 경우에도 답변 항목 내부에 <div>, <span>, <strong> 등 임의의 HTML 스타일 태그를 직접 작성하여 주입하지 마십시오. 레이아웃 붕괴를 유발하므로 텍스트 강조 시에는 오직 마크다운 문법(예: **강조**)을 사용하십시오.
19. 🚨 [빈 기호/제목 출력 금지]: 특정 항목(예: '메커니즘', '기본가정' 등)에 해당하는 내용이 없거나 쓸 필요가 없다면, 해당 소제목 기호나 단락 자체를 아예 생략하고 출력하지 마십시오. 빈 글머리 기호(예: "• 메커니즘:")만 덩그러니 남겨두는 행위는 엄격히 금지합니다.
20. 🚨 [수식 변수 및 아래첨자 결합 유지 규칙]: 수학 기호나 공식 내에서 물리량 변수 기호와 그 아래첨자(예: Nc, Df, kh 등)는 절대로 중간에 달러 기호($ 또는 $$)를 끼워 넣어서 서로 다른 블록으로 쪼개서 출력하지 마십시오. 반드시 수식 전체를 감싸서 하나의 수식 블록 내에 모두 포함시켜야 합니다. (예: $N_c$ (O) / N$_c$ (X), $\\text{N}_c$ (O) / \\text{N}$$_c (X))

[원시 JSON 출력 엄격 준수 규칙]
- JSON 구조 내부의 문자열에 LaTeX 수식을 작성할 때, 백슬래시(\\) 기호는 JSON 문법 표준에 의거하여 반드시 두 번 겹친 이스케이프 형태('\\\\frac', '\\\\alpha')로만 출력해야 합니다. 
- 절대로 단일 백슬래시('\\frac') 형태로 가공되지 않은 원시 문자열을 JSON 내부에 주입하여 문법 에러(Cartesian/Escape Syntax Error)를 유발하지 마십시오.

[JSON String Escape Rule]:
When generating LaTeX formulas inside a JSON string, you must strictly escape the backslash twice (e.g., "\\\\frac", "\\\\alpha") to ensure that the response remains perfectly valid for native JSON.parse() without crashing the backend system.

[🚨 수학적/산술적 검증 및 모순 방지 규칙 - 극도로 중요!]:
- 객관식 문제 출제 시, 정답("answer")으로 지정하는 값은 반드시 해설("explanation")에서 풀이하여 유도한 최종 계산값과 완벽하게 일치해야 합니다.
- 수식 계산(예: 비례 관계, 제곱근 계산 등)을 수행할 때는 종이에 적듯 단계별로 산술적 검증을 한 뒤, 최종 정답값의 보기(options) 문자열이 "answer" field에 오타 없이 똑같이 들어가도록 하십시오.
- 예를 들어 해설에서 '1/4배(0.25배)가 된다'고 올바르게 풀이해 놓고, 정답 필드("answer")에 '0.125배' 같은 엉뚱한 값을 세팅하는 논리적 모순/환각을 절대 저지르지 마십시오.
`;

export const LATEX_CHAT_PROMPT_INSTRUCTIONS = `
[🚨 극도로 중요한 LaTeX 수식 및 마크다운 렌더링 절대 준수 수칙]:
0. 🚨 [절대 금지 - JSON 응답 금지]: 당신은 실시간 대화형 챗봇/해설사이므로 절대로 JSON 형식(예: {"concept": "...", "explanation": "..."})으로 응답을 감싸서 출력하지 마십시오. 중괄호({ })나 큰따옴표가 들어간 JSON 키-값 구조는 렌더링 오류를 발생시킵니다. 오직 일반적인 한글 대화 문장 및 마크다운 포맷으로만 직접 답변하십시오.
1. 모든 수학 공식 및 개별 물리/공학 변수 기호(예: $K_s$, $k_h$, $e$, $c$, \\phi, \\sigma, \\tau, $u$, $z_c$, $F.S.$ 등)는 단독 문장 혹은 보기, 해설 내에 노출될 때도 무조건 인라인 LaTeX 기호 포맷인 $변수명$ 형태로 감싸서 출력하십시오. 날것의 텍스트 표기(예: \\gamma_w)는 엄격히 금지합니다. 반드시 $\\gamma_w$ 와 같이 감싸십시오. 답변에도 수식을 적극적으로 활용하되 반드시 기호로 감싸야 합니다.
2. 모든 LaTeX 명령어의 역슬래시(\\)는 단일 역슬래시(\\frac, \\sigma)로 작성하십시오. (※ JSON이 아닌 일반 마크다운 출력이므로 이중 역슬래시가 아닌 단일 역슬래시로 출력해야 정상 렌더링됩니다.)
3. In라인 수식 작성 시 $ 기호와 수식 내용 사이에 절대 공백(스페이스)을 두지 마십시오. (예: $수식$ (O) / $ 수식 $ (X))
4. 외부 공백 필수 조건: $ 기호의 앞과 뒤가 한글, 숫자, 문장 부호와 맞닿을 경우 반드시 앞뒤로 '한 칸의 공백(스페이스)'을 명시적으로 두어 격리하십시오. 한국어 조사('가', '는', '입니다' 등)와 결합할 때도 예외 없이 한 칸 띄우고 조사를 작성하십시오. (예: $B$ 가 4배로 증가 (O) / $B$가 4배로 증가 (X))
5. 인라인 수식 내 줄바꿈 절대 금지: 문장 중간의 $ 기호 사이 내용에서는 엔터(줄바꿈)를 절대 하지 말고 단일 줄로 이어서 작성하십시오.
6. 분수(\\frac), 거듭제곱근(\\sqrt), 미분방정식 항이 중첩된 복잡한 전개 수식은 문장 중간에 절대 섞어 쓰지 말고, 반드시 수식 블록 위아래로 빈 줄을 한 칸씩 띄운 뒤 디스플레이 수식 블록($$\\text{수식}$$)으로 완벽히 독립시켜 독자 단락으로 분리 출력하십시오.
7. 단순 수치나 단위(예: 10m, 20% 등)에는 LaTeX 기호($)를 쓰지 말고 일반 텍스트로 작성하십시오.
8. 수식 내부에서 특수 기호인 '작다' 기호는 \\lt 로, '크다' 기호는 \\gt 로 표기하여 마크다운 파싱 에러를 원천 차단하십시오.
9. 아래첨자('_')나 괄호 기호 앞에 임의의 역슬래시(\\)를 붙이지 마십시오.
10. LaTeX 공식 내부 중괄호 내에 한글을 결합하는 \\text{한글} 과 같은 행위는 철저히 금지합니다. 한글과 만날 때는 수식을 즉시 닫고 공백을 준 뒤 한글을 배치하십시오. (예: $B$ 가 4배로 증가)
11. 달러 기호($ 또는 $$)는 반드시 수식 전체를 감싸는 가장 바깥쪽에만 위치해야 하며, 중괄호({}) 내부에 달러 기호가 침투하지 않도록 이중 마킹을 엄격히 금지합니다.
12. 🚨 [마크다운 리스트 및 줄바꿈 수칙]: 항목을 나열하기 위해 리스트 기호(* 또는 -)를 사용할 때는 반드시 기호 뒤에 스페이스(공백)를 한 칸 띄우고 텍스트를 작성하십시오. (예: "* k: 투수계수" (O) / "*k: 투수계수" (X)). 
13. 문단 구분이나 설명 단락 간에는 가독성을 위해 적절히 줄바꿈(두 번 엔터 \\n\\n)을 사용하여 단락을 분리하되, 과도하게 세 번 이상의 연속 빈 줄을 남발하지 마십시오.
14. 🚨 [목록 시작 시 줄 띄우기 금지]: 대주제/소주제 구분선이나 콜론으로 끝나는 행(예: "• 주요 가정:", "• 메커니즘:") 바로 다음에 목록 항목(1., 2. 또는 *, - 등)이 올 경우에는 절대로 그 사이에 빈 줄(두 번 엔터 \\n\\n)을 넣지 말고, 단일 줄바꿈(\\n)으로만 연결하여 불필요한 빈 간격이 생기지 않도록 하십시오.
15. 🚨 [HTML 태그 사용 절대 금지]: 어떠한 경우에도 답변에 <div>, <span>, <strong> 등 임의의 HTML 스타일 태그를 직접 작성하여 주입하지 마십시오. 레이아웃 붕괴를 유발하므로 텍스트 강조 시에는 오직 마크다운 문법(예: **강조**)을 사용하십시오.
19. 🚨 [빈 기호/제목 출력 금지]: 특정 항목(예: '메커니즘', '기본가정' 등)에 해당하는 내용이 없거나 쓸 필요가 없다면, 해당 소제목 기호나 단락 자체를 아예 생략하고 출력하지 마십시오. 빈 글머리 기호(예: "• 메커니즘:")만 덩그러니 남겨두는 행위는 엄격히 금지합니다.
16. 🚨 [표(Table) 작성 철칙]: 답변 중 지표, 수치 비교, 매개변수 정리 등 표(Table) 형태의 데이터 표현이 필요한 경우, HTML이나 LaTeX tabular/matrix/array 환경을 사용하지 말고 반드시 표준 **마크다운 표(Markdown Table)** 형식(| 열1 | 열2 |과 구분선 | --- | --- |)으로만 작성하십시오.
17. 🚨 [컨테이너 중첩 절대 금지]: 여러 개의 수식 전개 과정이나 한글 설명 리스트 전체를 하나의 거대한 디스플레이 수식 블록($$...$$)으로 통째로 감싸지 마십시오. 반드시 개별 공식마다 독립된 $ 기호만 사용하십시오.
18. 🚨 [달러 기호 매칭 오류 및 이탈 방지 규칙]: 리스트 기호나 숫자가 포함된 번호 매기기(예: "1) 연성 벽체...", "2) 고강성...")가 포함된 문단 내에서 공식들을 나열할 때, 각 공식들은 개별적으로 완벽히 수식 기호($)로 열고 닫혀 있어야 합니다. 절대로 여는 수식 기호가 없는 상태에서 닫는 수식 기호만 배치하거나, 혹은 어설프게 매칭되어 한글 제목 전체가 수식 영역 안으로 빨려 들어가지 않도록 극도로 유의하십시오.
    - ❌ [절대 금지 오류 예시]: d_{H,max1} = ... $ 2) CIP 공법 적용 시: $ d_{H,max2} = ... (중간 한글 제목이 달러 기호에 갇히는 형태는 렌더링을 완전히 망가뜨립니다.)
20. 🚨 [수식 변수 및 아래첨자 결합 유지 규칙]: 수학 기호나 공식 내에서 물리량 변수 기호와 그 아래첨자(예: Nc, Df, kh 등)는 절대로 중간에 달러 기호($ 또는 $$)를 끼워 넣어서 서로 다른 블록으로 쪼개서 출력하지 마십시오. 반드시 수식 전체를 감싸서 하나의 수식 블록 내에 모두 포함시켜야 합니다. (예: $N_c$ (O) / N$_c$ (X), $\\text{N}_c$ (O) / \\text{N}$$_c (X))
`;
// Trigger redeployment with clean UTF-8 BOM-less encoding.

// Safe LaTeX-preserving backslash escaper for LLM JSON responses
export function escapeJsonBackslashes(str) {
  if (!str) return str;
  let result = '';
  let inString = false;
  let i = 0;
  
  const latexCommands = [
    // n
    'newline', 'nabla', 'nu', 'neq', 'neg', 'ni', 'notin', 'ngeq', 'nleq', 'nsim', 'ncong', 'nparallel', 'noindent',
    // t
    'theta', 'tau', 'tan', 'times', 'tilde', 'text', 'tfrac', 'triangle', 'top', 'to', 'tiny', 'today',
    // r
    'rho', 'right', 'rule', 'rangle', 'rightarrow', 'rightleftharpoons', 'rightharpoonup', 'rightharpoondown', 'real', 'ref', 'raise',
    // b
    'beta', 'bar', 'begin', 'bmod', 'boldsymbol', 'bullet', 'box', 'bigcap', 'bigcup', 'backslash',
    // f
    'frac', 'forall', 'flat', 'frown', 'footnotesize', 'fbox',
    // other greek/common commands
    'phi', 'varphi', 'mathrm'
  ];

  while (i < str.length) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
    } else if (inString && char === '\\') {
      const next = str[i + 1];
      
      if (next === '"' || next === '/' || next === '\\') {
        result += char + next;
        i += 2;
      } else if (next === 'n' || next === 't' || next === 'r' || next === 'b' || next === 'f') {
        let tempIndex = i + 1;
        let commandWord = '';
        while (tempIndex < str.length && /[a-zA-Z]/.test(str[tempIndex])) {
          commandWord += str[tempIndex];
          tempIndex++;
        }
        
        const isLatex = latexCommands.some(cmd => commandWord.startsWith(cmd));
        if (isLatex) {
          result += '\\\\';
          i++;
        } else {
          result += char + next;
          i += 2;
        }
      } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(str.substring(i + 2, i + 6))) {
        // Safe unicode sequence bypass
        result += char + next + str.substring(i + 2, i + 6);
        i += 6;
      } else {
        result += '\\\\';
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}

export function parseLlmJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  
  // 마크다운 코드 블록 제거 복원
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  }

  const escaped = escapeJsonBackslashes(cleaned);
  return JSON.parse(escaped);
}
