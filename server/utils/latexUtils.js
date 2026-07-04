// 1. 수식($), 일반 텍스트, 그리고 보호된 표 블록 분리 (인라인 줄바꿈 오염 방지)
export function tokenizeForHealing(text) {
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
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line.includes('|')) {
      const nextLine = lines[i + 1].trim();
      const isSeparator = nextLine.includes('-') && nextLine.includes('|') && /^[\s|:\-]+$/.test(nextLine);
      if (isSeparator) {
        // We found a table starting at index i
        const startIdx = i;
        let endIdx = i + 1;
        while (endIdx + 1 < lines.length && lines[endIdx + 1].trim().includes('|')) {
          endIdx++;
        }
        
        const parseRow = (l) => {
          const trimmed = l.trim();
          const parts = trimmed.split('|');
          if (trimmed.startsWith('|')) parts.shift();
          if (trimmed.endsWith('|')) parts.pop();
          return parts.map(cell => cell.trim());
        };

        const headers = parseRow(lines[startIdx]);
        const rows = [];
        for (let r = startIdx + 2; r <= endIdx; r++) {
          rows.push(parseRow(lines[r]));
        }
        
        const originalTableText = lines.slice(startIdx, endIdx + 1).join('\n');
        return {
          tableData: { headers, rows },
          originalTableText
        };
      }
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

// Whitelisted LaTeX math commands for safe auto-wrapping
const MATH_COMMANDS = [
  'frac', 'dfrac', 'tfrac', 'sqrt', 'cdot', 'times', 'div', 'pm', 'infty', 'partial', 'sum', 'int', 'sim',
  'le', 'ge', 'lt', 'gt', 'sin', 'cos', 'tan', 'log', 'ln', 'nabla', 'neq', 'ne', 'approx',
  'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'nu', 'xi', 'zeta', 'chi', 'upsilon', 'kappa',
  'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
  'rightarrow', 'leftarrow', 'circ', 'deg', 'dot', 'ddot', 'bar', 'hat', 'tilde',
  'quad', 'qquad', 'text', 'left', 'right'
];

// Regex matching math formulas containing at least one whitelisted command
const formulaRegex = new RegExp(
  `(?:[a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/=.,·][a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/= \\t.,·]*)?` +
  `\\\\(?:${MATH_COMMANDS.join('|')})` +
  `(?![a-zA-Z])` +
  `[a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/= \\t.,<>%\\\\·]*`,
  'g'
);

// Regex matching simple math variables/relations (without backslash commands)
const simpleVariableRegex = new RegExp(
  // 1. Relations (most specific, e.g. k_h = 10, y(x) = ax + b, z < z_c)
  `\\b[a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]]+\\s*(?:[+=<>]|\\s+[-/\\*]\\s+)\\s*[a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]]+(?:\\s*(?:[+=<>]|\\s+[-/\\*]\\s+)\\s*[a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]]+)*\\b|` +
  // 2. Function notation (e.g. p(z), w(z))
  `\\b[a-zA-Z]\\([a-zA-Z0-9_']+\\)(?![a-zA-Z0-9_'])|` +
  // 3. Subscripted variables (e.g. k_h, z_c)
  `\\b[a-zA-Z0-9]+_[a-zA-Z0-9_']+\\b|` +
  // 4. Constants
  `\\b(?:EI|EA|FS)\\b|` +
  `\\bF\\.S\\.(?![a-zA-Z0-9_'])`,
  'g'
);

function replaceRoots(str) {
  let processed = str;
  processed = processed.replace(/√(?!\()/g, '\\sqrt ');

  let regex = /(?:([0-9]+)(?:_|계)?)?(?:루트|√)\(/;
  let match;
  
  while ((match = processed.match(regex)) !== null) {
    const index = match.index;
    const matchLength = match[0].length;
    const rootNum = match[1] || '';
    
    let depth = 1;
    let scanIdx = index + matchLength;
    while (scanIdx < processed.length && depth > 0) {
      if (processed[scanIdx] === '(') depth++;
      else if (processed[scanIdx] === ')') depth--;
      scanIdx++;
    }
    
    if (depth === 0) {
      const content = processed.substring(index + matchLength, scanIdx - 1);
      
      // Check if the match is already inside an existing math block
      const beforeText = processed.substring(0, index);
      const dollarCount = (beforeText.match(/\$/g) || []).length;
      const isAlreadyInMath = (dollarCount % 2 === 1);
      
      let replacement;
      if (isAlreadyInMath) {
        replacement = rootNum ? `\\sqrt[${rootNum}]{${content}}` : `\\sqrt{${content}}`;
      } else {
        replacement = rootNum ? `$\\sqrt[${rootNum}]{${content}}$` : `$\\sqrt{${content}}$`;
      }
      processed = processed.substring(0, index) + replacement + processed.substring(scanIdx);
    } else {
      break;
    }
  }
  return processed;
}

export function healInvertedDelimiters(text) {
  if (!text || typeof text !== 'string') return text;

  const hasFormulaCommands = (str) => {
    // Check if it has backslash/won commands or common math notations
    const rx = /(?:₩|\\)(?:Delta|sigma|gamma|cdot|tau|pi|theta|alpha|beta|phi|omega|mu|lambda|rho|nu|times|frac|dfrac|le|ge|ne|neq|sqrt|sum|int|partial|sin|cos|tan)\b|[+\-*/=<>_^]|\b[a-zA-Z]_[a-zA-Z0-9]\b/i;
    return rx.test(str);
  };

  const parts = text.split('$');
  if (parts.length > 2) {
    let oddPlainCount = 0;
    let evenFormulaCount = 0;

    for (let i = 0; i < parts.length; i++) {
      const isOdd = i % 2 !== 0;
      const content = parts[i].trim();
      if (!content) continue;

      const isFormula = hasFormulaCommands(content);
      if (isOdd && !isFormula && /[가-힣]/.test(content)) {
        oddPlainCount++;
      }
      if (!isOdd && isFormula) {
        evenFormulaCount++;
      }
    }

    if (oddPlainCount > 0 && evenFormulaCount > 0) {
      // Rebuild by swapping delimiters
      let rebuilt = '';
      for (let i = 0; i < parts.length; i++) {
        const content = parts[i];
        if (hasFormulaCommands(content)) {
          // If it's a formula, make sure it is wrapped in $
          rebuilt += `$${content.trim()}$`;
        } else {
          // Otherwise, it's plain text, keep it as-is (without $)
          rebuilt += content;
        }
      }
      return rebuilt;
    }
  }
  return text;
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
  // Normalize dashes (en-dash, em-dash, math minus) to standard hyphens
  processed = processed.replace(/[–—−]/g, '-');

  // Protect code blocks (``` ... ```) from intermediate healing modifications
  const codeBlocks = [];
  let codeBlockIndex = 0;
  processed = processed.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
    const placeholder = `___HEAL_CODE_BLOCK_${codeBlockIndex}___`;
    codeBlocks.push({ placeholder, content: match });
    codeBlockIndex++;
    return placeholder;
  });

  // [Self-Healing] Remove space between backslash and Greek commands (including trailing alphanumeric characters)
  const greekSubscriptFullLetters = 'alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa';
  const spaceRegex = new RegExp(`\\\\\\s+(${greekSubscriptFullLetters})([a-zA-Z0-9]*)\\b`, 'gi');
  processed = processed.replace(spaceRegex, '\\$1$2');

  // [Self-Healing] Clean up Greek letter variables missing underscores (e.g. \sigmav -> \sigma_v, \sigma'v -> \sigma'_v)
  const greekSubscriptLetters = 'sigma|gamma|tau|theta|alpha|beta|epsilon|phi|psi|omega|mu|nu';
  const greekSubscriptRegex = new RegExp(`\\\\(${greekSubscriptLetters})('?)([a-zA-Z0-9])\\b`, 'gi');
  processed = processed.replace(greekSubscriptRegex, '\\$1$2_$3');

  // [Self-Healing] Remove space between backslash and general math commands
  processed = processed.replace(/\\\s+(Delta|Sigma|Gamma|Phi|Theta|Omega|frac|dfrac|tfrac|sqrt|cdot|times|div|pm|infty|partial|sum|int|sim|le|ge|lt|gt|sin|cos|tan|log|ln|nabla|neq|ne|approx)\b/g, '\\$1');

  // [Self-Healing] Fix space-corrupted or missing-space Delta variables (e.g. \Deltau, \ Deltau, \Deltasigma)
  const greekNames = 'alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa|Delta|Sigma|Gamma|Phi|Theta|Omega';
  const deltaGreekRegex = new RegExp(`\\\\\\s*Delta\\s*(${greekNames})\\b`, 'gi');
  processed = processed.replace(deltaGreekRegex, '\\Delta \\$1');
  processed = processed.replace(/\\\s*Delta\s*([a-zA-Z])\b/gi, '\\Delta $1');

  // [🚨 KaTeX HTML 블록 최우선 복원 필터 🚨]
  // 텍스트 내부에 들어있는 KaTeX HTML 사전 렌더링 블록을 감지하여
  // 그 내부에 들어있는 원본 LaTeX 수식 문자열(annotation encoding="application/x-tex")을 추출한 뒤,
  // 일반 Markdown 수식($...$)으로 즉시 변환하여 토큰화 오작동 및 텍스트 쪼개짐을 완벽히 방지합니다.
  try {
    const rawKatexHtmlRegex = /<(div|span)\b[^>]*?class=["'][^"']*\b(?:formula-scroll-container|katex|inline|katex-display|katex-error)\b[^"']*["'][\s\S]*?<\/\s*\1\s*>/gi;
    processed = processed.replace(rawKatexHtmlRegex, (htmlBlock) => {
      const match = htmlBlock.match(/<annotation[^>]*?encoding=["']?application\/x-tex["']?[^>]*?>([\s\S]*?)<\/annotation>/i);
      if (match && match[1]) {
        const formula = match[1].trim().replace(/\\+/g, '\\');
        return ` $${formula}$ `;
      }
      const errMatch = htmlBlock.match(/title=["']KaTeX error:\s*([\s\S]*?)["']/i);
      if (errMatch && errMatch[1]) {
        const formula = errMatch[1].trim().replace(/\\+/g, '\\');
        return ` $${formula}$ `;
      }
      return '';
    });

    // 만약 이미 태그 사이에 이상한 띄어쓰기가 삽입되어 망가진 HTML 블록이 있다면 이것도 함께 복원
    const spaceCorruptedKatexRegex = /<\s*(div|span)\b[\s\S]*?class\s*=\s*["'][^"']*\b(?:formula-scroll-container|katex|inline|katex-display|katex-error)\b[^"']*["'][\s\S]*?<\/\s*\1\s*>/gi;
    processed = processed.replace(spaceCorruptedKatexRegex, (htmlBlock) => {
      const match = htmlBlock.match(/<\s*annotation[^>]*encoding\s*=\s*["']?application\/x-tex["']?[^>]*?>([\s\S]*?)<\/\s*annotation\s*>/i);
      if (match && match[1]) {
        const formula = match[1].trim().replace(/\\+/g, '\\');
        return ` $${formula}$ `;
      }
      return '';
    });
  } catch (e) {
    console.warn('[healLatexFormulas] Failed to pre-process KaTeX HTML block:', e);
  }

  processed = healInvertedDelimiters(processed);

  // Convert Greek letters with numbers (e.g. sigma1, sigma_1 -> \sigma_1)
  const greekLetters = 'alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa';
  const greekRegex = new RegExp(`(?<!\\\\)\\b(${greekLetters})_?(\\d+)\\b`, 'g');
  processed = processed.replace(greekRegex, '\\$1_$2');

  // Replace Won symbol (₩) with backslash (\) to restore LaTeX commands
  processed = processed.replace(/₩/g, '\\');

  // Replace hashtag (#) prefix before LaTeX commands/Greek letters with backslash (\)
  const hashKeywords = [
    'alpha', 'beta', 'gamma', 'sigma', 'tau', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'nu', 'xi', 'zeta', 'chi', 'upsilon', 'kappa',
    'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
    'frac', 'dfrac', 'sqrt', 'cdot', 'times', 'div', 'pm', 'infty', 'partial', 'sum', 'int', 'sim',
    'le', 'ge', 'lt', 'gt', 'sin', 'cos', 'tan', 'log', 'ln', 'nabla', 'neq', 'ne', 'approx'
  ];
  const hashRegex = new RegExp(`#(${hashKeywords.join('|')})(?![a-zA-Z])`, 'g');
  processed = processed.replace(hashRegex, '\\$1');

  // Replace Greek unicode letters and standalone words with LaTeX commands
  processed = processed.replace(/β/g, '\\beta')
                       .replace(/α/g, '\\alpha')
                       .replace(/γ/g, '\\gamma')
                       .replace(/σ/g, '\\sigma')
                       .replace(/τ/g, '\\tau')
                       .replace(/φ/g, '\\phi')
                       .replace(/θ/g, '\\theta')
                       .replace(/μ/g, '\\mu')
                       .replace(/λ/g, '\\lambda')
                       .replace(/η/g, '\\eta')
                       .replace(/ν/g, '\\nu')
                       .replace(/π/g, '\\pi')
                       .replace(/δ/g, '\\delta')
                       .replace(/ω/g, '\\omega')
                       .replace(/ε/g, '\\epsilon')
                       .replace(/ψ/g, '\\psi')
                       .replace(/ρ/g, '\\rho')
                       .replace(/ξ/g, '\\xi')
                       .replace(/ζ/g, '\\zeta')
                       .replace(/χ/g, '\\chi')
                       .replace(/υ/g, '\\upsilon')
                       .replace(/κ/g, '\\kappa')
                       .replace(/Δ/g, '\\Delta')
                       .replace(/Σ/g, '\\Sigma')
                       .replace(/Gamma/g, '\\Gamma')
                       .replace(/Phi/g, '\\Phi')
                       .replace(/Theta/g, '\\Theta')
                       .replace(/Omega/g, '\\Omega');

  // Convert English names of Greek letters if written as standalone words (case-insensitive)
  processed = processed.replace(/(?<!\\)\b(alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa)\b/g, '\\$1');
  processed = processed.replace(/(?<!\\)\b(Delta|Sigma|Gamma|Phi|Theta|Omega)\b/g, '\\$1');

  // Parse root patterns
  processed = replaceRoots(processed);

  // Restore LaTeX commands corrupted by JSON escape sequence parsing (e.g. \neq -> \x0a + eq)
  processed = processed.replace(/\x0a\s*eq\b/g, '\\neq')
                       .replace(/\x0a\s*e\b/g, '\\ne')
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
                       .replace(/\x09\s*frac\b/g, '\\tfrac')
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

  // [Self-Healing] 포아송비 기호 오류 자가치유 (u 나 v 기호를 그리스 문자 \nu 로 변환)
  // 포아송비 또는 비배수 조건 관련 문맥이 존재하는 경우에만 자가치유 작동 (간극수압 u 기호 오염 방지)
  let poissonSymbol = passedPoissonSymbol;
  if (!poissonSymbol) {
    if (/포아송/i.test(processed)) {
      // Check for 'u' used as Poisson's ratio ANYWHERE in the text (not just adjacent to 포아송).
      // Patterns: 1+u, 1-u, 1-2u, $u$, $u_u$, $u'$, 포아송비(u), etc.
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

  if (poissonSymbol) {
    // Handle subscripted notation: $u_u$ → $\nu_u$, $v_u$ → $\nu_u$ (undrained Poisson's ratio)
    processed = processed.replace(new RegExp(`\\$${poissonSymbol}(_[a-zA-Z0-9])\\$`, 'g'), (match, sub) => {
      return `$\\nu${sub}$`;
    });
    // Handle primed notation: $u'$ → $\nu'$ (drained Poisson's ratio)
    processed = processed.replace(new RegExp(`\\$${poissonSymbol}'\\$`, 'g'), "$\\nu'$");

    const standaloneRegex = new RegExp(`(?<!\\\\)(?:\\$${poissonSymbol}\\$|\\b${poissonSymbol}\\b)`, 'g');
    processed = processed.replace(standaloneRegex, (match) => {
      return match.includes('$') ? '$\\nu$' : '\\nu';
    });
  }

  // 항상 변환해야 하는 일반적인 포아송비 수식 관계식 치유 (예: 3(1-2u), 2(1+u), 3(1-2v), 2(1+v), 1-u, 1-v)
  processed = processed.replace(/(?<=\b1\s*-\s*2\s*)[uv]\b/g, '\\nu');
  processed = processed.replace(/(?<=\b1\s*\+\s*)[uv]\b/g, '\\nu');
  processed = processed.replace(/(?<=\b1\s*-\s*)[uv]\b/g, '\\nu');

  // [🚨 가독성 수동 개선 필터 (ReDoS 예방 루프 방식) 🚨]
  // 등호나 연산자, 분수가 포함된 수식($...$)들이 콤마나 개행 없이 다닥다닥 붙어 나열되거나, 중간에 짧은 설명만 끼고 나열되는 경우 강제로 단락 줄바꿈(\n\n)을 주입합니다.
  const formatConsecutiveFormulas = (text) => {
    if (!text || typeof text !== 'string') return text;
    const parts = text.split('$');
    if (parts.length < 3) return text;
    
    const isRelation = [];
    for (let i = 1; i < parts.length; i += 2) {
      const f = parts[i];
      isRelation[i] = f.includes('=') || f.includes('<') || f.includes('>');
    }
    
    const startsWithKoreanParticle = (nextText) => {
      if (!nextText) return false;
      const trimmed = nextText.trim();
      // 닫는 괄호로 시작하면 수식이 괄호 안에 포함된 것이므로 블록 승격 방지
      if (/^[)\]】」』》]/.test(trimmed)) return true;
      return /^(?:일\s*때|이므로|이고|이며|와\b|과\b|은\b|는\b|이\b|가\b|을\b|를\b|의\b|에\b|로\b|으로\b|라\s*하면|라\s*할\s*때|에\s*대입|을\s*대입|를\s*대입|의\s*값|을\s*구하면|를\s*구하면|에서\b|보다\b|처럼\b|하고\b|하며\b|의\s*형태|으로\s*정의)/.test(trimmed);
    };

    const isSentenceEnded = (prevText) => {
      if (!prevText) return true;
      const trimmed = prevText.trim();
      if (trimmed === '') return true;
      return /[.!?\n]$/.test(trimmed) || /(?:다|요|음|임|함|것|정리됩니다|대입합니다|구합니다|얻어집니다|나타납니다|설정합니다)\.?$/.test(trimmed);
    };

    const hasBalancedParentheses = (str) => {
      let p = 0, b = 0, c = 0;
      for (let char of str) {
        if (char === '(') p++;
        else if (char === ')') p--;
        else if (char === '[') b++;
        else if (char === ']') b--;
        else if (char === '{') c++;
        else if (char === '}') c--;
      }
      return p === 0 && b === 0 && c === 0;
    };

    const elevateToDisplay = new Array(parts.length).fill(false);

    let idx = 1;
    while (idx < parts.length) {
      if (isRelation[idx]) {
        const group = [idx];
        let nextIdx = idx + 2;
        while (nextIdx < parts.length) {
          const separator = parts[nextIdx - 1];
          const trimmedSep = separator.trim();
          const isSepSpaceOrComma = trimmedSep === '' || trimmedSep === ',';
          const isSepShortParenthesis = trimmedSep.startsWith('(') && trimmedSep.endsWith(')') && trimmedSep.length <= 20;
          // 단위+쉼표 구분자 (예: "kPa,", "m,") → 연속 관계식 그룹으로 병합 허용
          const isSepUnitComma = trimmedSep.length > 0 && trimmedSep.length <= 15 && /,$/.test(trimmedSep) && !/[\uAC00-\uD7A3]/.test(trimmedSep);
          
          if (isRelation[nextIdx] && (isSepSpaceOrComma || isSepShortParenthesis || isSepUnitComma)) {
            group.push(nextIdx);
            nextIdx += 2;
          } else {
            break;
          }
        }

        const lastFormulaIdx = group[group.length - 1];
        const textAfterGroup = parts[lastFormulaIdx + 1] || '';
        const isFollowedByParticle = startsWithKoreanParticle(textAfterGroup);

        if (!isFollowedByParticle) {
          // Check if the overall group parentheses are balanced
          let combinedFormulaText = '';
          group.forEach(gIdx => {
            combinedFormulaText += parts[gIdx];
          });
          const isGroupBalanced = hasBalancedParentheses(combinedFormulaText);

          if (isGroupBalanced) {
            if (group.length > 1) {
              // 그룹 내 모든 수식이 단순 산술식이면 블록 승격 방지
              const allSimple = group.every(gIdx => !/\\[a-zA-Z]/.test(parts[gIdx]));
              if (!allSimple) {
                group.forEach(gIdx => {
                  elevateToDisplay[gIdx] = true;
                });
              }
            } else {
              const textBefore = parts[idx - 1] || '';
              const textAfter = parts[idx + 1] || '';
              const isSelfBalanced = hasBalancedParentheses(parts[idx]);
              // 단순 산술식(LaTeX 명령어 없는 숫자/연산자만)은 인라인 유지 (블록 승격 방지)
              // 예: "1.65 - 1.2 = 0.45", "0.45/1.5 = 0.3" 등
              const isSimpleArithmetic = !/\\[a-zA-Z]/.test(parts[idx]);
              // 앞 텍스트가 여는 괄호로 끝나면 괄호 내부 수식이므로 블록 승격 방지
              const isInsideParens = /[(\[]\s*$/.test(textBefore.trim());
              if (isSelfBalanced && isSentenceEnded(textBefore) && !startsWithKoreanParticle(textAfter) && !isSimpleArithmetic && !isInsideParens) {
                elevateToDisplay[idx] = true;
              }
            }
          }
        }
        idx = nextIdx;
      } else {
        idx += 2;
      }
    }
    
    let rebuilt = parts[0];
    for (let i = 1; i < parts.length; i += 2) {
      let formula = parts[i];
      let plainText = parts[i + 1];
      
      const isElevated = elevateToDisplay[i];
      const nextElevated = elevateToDisplay[i + 2];
      
      if (plainText !== undefined && nextElevated) {
        const trimmed = plainText.trim();
        if (trimmed.startsWith(',')) {
          formula = formula.trim() + ',';
          plainText = plainText.replace(/^\s*,\s*/, '');
        }
      }
      
      if (isElevated) {
        // 블록 수식 앞에 텍스트가 있으면 줄바꿈을 삽입하여 한글 줄 감지와 분리
        if (rebuilt && rebuilt.length > 0 && !rebuilt.endsWith('\n')) {
          rebuilt += '\n\n';
        }
        rebuilt += `$$${formula}$$`;
      } else {
        rebuilt += `$${formula}$`;
      }
      
      if (plainText !== undefined) {
        if (isElevated || nextElevated) {
          const trimmed = plainText.trim();
          rebuilt += trimmed ? `\n${trimmed}\n` : '\n';
        } else {
          rebuilt += plainText;
        }
      }
    }
    return rebuilt;
  };
  processed = formatConsecutiveFormulas(processed);

  // [🚨 극단적 비상 복구 필터 🚨]
  // 이전 버전의 깨진 정규식에 의해 이미 오염되어 DB/세션에 들어간 KaTeX HTML 블록 복원
  processed = processed.replace(
    /<\s*(div|span)class\b[\s\S]*?<\/\s*\1\s*>/gi,
    (htmlBlock) => {
      const match = htmlBlock.match(/<\s*annotationencoding[^>]*>\s*([\s\S]*?)\s*<\/\s*annotation\s*>/i) ||
                    htmlBlock.match(/<annotation[^>]*?encoding=["']?application\/x-tex["']?[^>]*?>([\s\S]*?)<\/annotation>/i);
      if (match && match[1]) {
        const formula = match[1].trim().replace(/\\+/g, '\\');
        return ` $${formula}$ `;
      }
      return '';
    }
  );

  if (!isNested) {
    processed = htmlTableToMarkdown(processed, poissonSymbol);
    processed = wrapMarkdownTables(processed);
  }

  // (Poisson's ratio healing logic moved above JSON escape restoration to prevent table breaking)

  // [Self-Healing] Restore collapsed newlines for variable list items
  processed = processed.replace(/(?<=:[^\n]*)\s+([–—−-]\s*(?:\$[^\$]+\$|[a-zA-Z0-9_\\\{\}]+)\s*:)/g, '\n$1');

  // [Self-Healing] Auto-wrap raw LaTeX symbols/variables in bullet lists with $ if missing
  // Matches bullet points or numbers followed by a CJK-free math variable/symbol and a colon
  if (typeof processed === 'string') {
    processed = processed.split('\n').map(line => {
      const bulletRegex = /^([ \t]*(?:\*|-|•|▪|▫|·|\d+\.|\d+\)|[a-zA-Z가-힣]\.|\b[a-zA-Z가-힣]\)|[①-⑳]|\[INPUT_\d+(?:_\d+)?\])[ \t]*)(?!\$)([a-zA-Z0-9_\\'\^\(\)\{\}\+\-\*\/=]+)(?!\$)([ \t]*:)/;
      return line.replace(bulletRegex, (match, p1, p2, p3) => `${p1}$${p2}$${p3}`);
    }).join('\n');
  }

  // [🔥 치명적 버그 해결] AI의 이중 이스케이프 오류(\\phi -> \phi) 최우선 복구
  processed = processed.replace(/\\{2,}([a-zA-Z]+)/g, '\\$1');
  // Collapse double or multiple backslashes before % to single backslash
  processed = processed.replace(/\\{2,}%/g, '\\%');

  // [Self-Healing] 수식 분리 오작동 치유 (예: \quad \text{N}$$_c or N$$_c or \text{N}$$_c -> $$\quad \text{N}_c)
  processed = processed.replace(/(\\quad\s*\\text\{[a-zA-Z]+\}|\b[a-zA-Z]+\b|\b\\text\{[a-zA-Z]+\})\s*\$\$(\s*_[a-zA-Z0-9])/g, '$$$$ $1$2');
  processed = processed.replace(/(\\quad\s*\\text\{[a-zA-Z]+\}|\b[a-zA-Z]+\b|\b\\text\{[a-zA-Z]+\})\s*\$(\s*_[a-zA-Z0-9])/g, '$$ $1$2');

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
      return healMarkdownTable(section, poissonSymbol); // 표 영역은 개별 셀 치유 및 원본 구조 유지
    }
    // 문장 한복판에 쪼개진 단일 줄바꿈(\n)을 공백으로 병합하던 규칙을 비활성화하여 줄바꿈을 보존합니다.
    return section;
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
      let t = token.content;
      // Auto-wrap unwrapped LaTeX math formulas
      t = t.replace(formulaRegex, (match) => {
        const trailingSpaces = match.match(/\s*$/)[0];
        const trimmed = match.trim();
        const trailingPunctuation = trimmed.match(/[.,;:!]+$/);
        const punc = trailingPunctuation ? trailingPunctuation[0] : '';
        const formula = trimmed.slice(0, trimmed.length - punc.length).trim();
        return `$${formula}$${punc}${trailingSpaces}`;
      });
      // Re-tokenize and wrap simple variables in remaining text to prevent double-wrapping
      const subTokens = tokenizeForHealing(t);
      t = subTokens.map(subToken => {
        if (subToken.type === 'text') {
          return subToken.content.replace(simpleVariableRegex, (match) => {
            const trailingSpaces = match.match(/\s*$/)[0];
            const trimmed = match.trim();
            if (trimmed === 'START_TABLE' || trimmed === 'END_TABLE') return match;
            const trailingPunctuation = trimmed.match(/[.,;:!]+$/);
            const punc = trailingPunctuation ? trailingPunctuation[0] : '';
            const formula = trimmed.slice(0, trimmed.length - punc.length).trim();
            return `$${formula}$${punc}${trailingSpaces}`;
          });
        }
        return subToken.content;
      }).join('');
      // Escape angle brackets for safety (preventing \gt -> ₩gt on Windows)
      return t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  result = result.replace(/[ \t]+/g, ' ').trim();

  // 2. Restore [INPUT_n] placeholders (remove accidental math formatting)
  result = result.replace(/\$?\[\s*INPUT_(\d+(?:_\d+)?)\s*\]\$?/gi, '[INPUT_$1]');

  if (!isNested) {
    result = result.replace(/(?:<!--|\\lt !--)\s*(?:-\s*)*\s*(?:START|END)_TABLE\s*(?:-\s*)*\s*(?:-->|--\\gt|>|\\gt)\n?/gi, '');
  }

  // Restore code blocks
  codeBlocks.forEach(block => {
    while (result.includes(block.placeholder)) {
      result = result.replace(block.placeholder, () => block.content);
    }
  });

  return result;
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
    if (/\[INPUT_\d+(?:_\d+)?\]/i.test(obj)) {
      return obj;
    }
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

const localParseOverviewContent = (content) => {
  const result = { definition: '', mechanism: '', comparison: '', significance: '', intuitive: '' };
  if (!content) return result;
  const lines = content.split('\n');
  for (const line of lines) {
    if (!line.includes('|')) continue;
    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const key = parts[0];
    const val = parts[1];
    
    if (key.includes('개요')) {
      result.definition = val;
    } else if (key.includes('메커니즘')) {
      result.mechanism = val;
    }
  }
  return result;
};

const localParseHtmlTable = (htmlStr) => {
  if (typeof DOMParser === 'undefined') return { headers: [], rows: [] };
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlStr || '', 'text/html');
  const thead = doc.querySelector('thead');
  const allTrs = Array.from(doc.querySelectorAll('tr'));
  const dataTrs = thead ? allTrs.filter(tr => !tr.closest('thead')) : allTrs.slice(1);
  const rows = [];
  for (const tr of dataTrs) {
    const tds = Array.from(tr.querySelectorAll('td, th')).map(el => el.textContent.trim());
    if (tds.length > 0) {
      rows.push(tds);
    }
  }
  return { rows };
};

export function healQuizQuestionObject(q) {
  if (q && typeof q === 'object') {
    if (q.question && (!q.tableData || !q.tableData.headers || !q.tableData.rows)) {
      const parsed = parseQuestionTableText(q.question);
      if (parsed.tableData) {
        q.tableData = parsed.tableData;
        q.question = parsed.questionText;
      }
    }

    // For multiple choice questions, heal mismatched answer field
    if (q.options && Array.isArray(q.options) && q.answer) {
      const hasExactMatch = q.options.includes(q.answer);
      if (!hasExactMatch) {
        let bestOpt = null;
        let maxScore = -1;
        
        const getOptionMatchScore = (opt, answer) => {
          const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
          const cOpt = clean(opt);
          const cAns = clean(answer);
          
          if (cOpt === cAns) return 1000;
          
          if (opt.includes('=')) {
            const parts = opt.split('=');
            const rhs = parts[parts.length - 1];
            if (clean(rhs) === cAns) return 900;
          }
          
          if (opt.trim().endsWith(answer.trim())) return 800;
          if (opt.trim().startsWith(answer.trim())) return 700;
          
          if (cAns && cOpt.includes(cAns)) {
            return 500 - (cOpt.length - cAns.length);
          }
          return 0;
        };

        for (const opt of q.options) {
          const score = getOptionMatchScore(opt, q.answer);
          if (score > maxScore) {
            maxScore = score;
            bestOpt = opt;
          }
        }

        if (bestOpt && maxScore > 0) {
          console.log(`[HealMC] Overwriting q.answer from "${q.answer}" to exact option: "${bestOpt}" (score: ${maxScore})`);
          q.answer = bestOpt;
        }
      }
    }

    const hasInputPlaceholder = q.tableData && q.tableData.rows && q.tableData.rows.some(row => 
      Array.isArray(row) && row.some((cell, cIdx) => cIdx > 0 && typeof cell === 'string' && (
        cell.includes('[INPUT_') || 
        /빈칸\s*\(?\d+\)?/i.test(cell) || 
        /^\s*[\[\(]?\s*[A-Za-z]\s*[\]\)]?\s*$/i.test(cell)
      ))
    );

    // For table subjective fill-in questions, empty out all cell contents 
    // (except headers and row-label column) and turn them into inputs!
    if ((q.type === '주관식 (표채우기)' || q.subtype === '표채우기' || hasInputPlaceholder) && q.tableData && q.tableData.rows) {
      if (!q.subtype || q.subtype !== '표채우기') {
        q.subtype = '표채우기';
      }
      const oldAnswers = q.answers || q.answer || {};
      const newAnswers = {};
      let inputCount = 1;

      const newRows = q.tableData.rows.map((row, rIdx) => {
        if (!Array.isArray(row)) return [];
        return row.map((cell, cIdx) => {
          if (cIdx === 0) return cell; // Keep the row label intact

          const inputId = `INPUT_${inputCount}`;
          const currentCount = inputCount;
          inputCount++;

          // Extract correct answer:
          let correctAnswer = '';
          const trimmedCell = typeof cell === 'string' ? cell.trim() : '';
          
          // Let's find the placeholder identifier (e.g. A, B, C, INPUT_1, 빈칸(1) 등)
          let placeholderId = '';
          const inputMatch = trimmedCell.match(/INPUT_(\d+(?:_\d+)?)/i);
          const letterMatch = trimmedCell.match(/^[\[\(]?\s*([A-Za-z])\s*[\]\)]?$/);
          const binkanMatch = trimmedCell.match(/빈칸\s*\(?(\d+)\)?/i);
          
          let matchedNum = null;
          if (inputMatch) {
            placeholderId = `INPUT_${inputMatch[1]}`;
            if (!inputMatch[1].includes('_')) {
              matchedNum = parseInt(inputMatch[1], 10);
            }
          } else if (letterMatch) {
            placeholderId = letterMatch[1].toUpperCase(); // e.g. "A"
            matchedNum = letterMatch[1].toUpperCase().charCodeAt(0) - 64;
          } else if (binkanMatch) {
            placeholderId = `INPUT_${binkanMatch[1]}`;
            matchedNum = parseInt(binkanMatch[1], 10);
          }

          // Robust check helper
          const lookup = (key) => {
            if (key === undefined || key === null) return undefined;
            return oldAnswers[key];
          };

          // 1. Try directly with placeholderId (case insensitive)
          let foundVal = lookup(placeholderId) ?? lookup(placeholderId?.toLowerCase()) ?? lookup(placeholderId?.toUpperCase());

          // 2. If matchedNum is available, try corresponding index / letter
          if (foundVal === undefined && matchedNum !== null) {
            const letterKey = String.fromCharCode(64 + matchedNum); // A, B, C...
            foundVal = lookup(letterKey) ?? lookup(letterKey.toLowerCase()) ?? lookup(`INPUT_${matchedNum}`) ?? lookup(`input_${matchedNum}`) ?? lookup(matchedNum) ?? lookup(String(matchedNum));
          }

          // 3. Sequential fallback based on currentCount
          if (foundVal === undefined) {
            const seqLetter = String.fromCharCode(64 + currentCount); // A, B, C...
            foundVal = lookup(`INPUT_${currentCount}`) ?? lookup(`input_${currentCount}`) ?? lookup(currentCount) ?? lookup(String(currentCount)) ?? lookup(seqLetter) ?? lookup(seqLetter.toLowerCase());
          }

          if (foundVal !== undefined) {
            correctAnswer = foundVal;
          } else {
            // If no placeholder value was found in oldAnswers, keep the cell text if it's not a placeholder
            const isPlaceholder = /^(?:[\[\(]?\s*[A-Za-z]\s*[\]\)]?|\[?\s*INPUT_\d+(?:_\d+)?\s*\]?|빈칸\s*\(?\d+\)?)$/i.test(trimmedCell);
            correctAnswer = isPlaceholder ? '' : cell;
          }

          // Recover placeholder answers from window.currentStudyData if available
          const isPlh = /^(?:[\[\(]?\s*[A-Za-z]\s*[\]\)]?|\[?\s*INPUT_\d+(?:_\d+)?\s*\]?|빈칸\s*\(?\d+\)?|\[?\s*[A-Z]_\d+\s*\]?)$/i.test(correctAnswer);
          if ((!correctAnswer || isPlh) && typeof window !== 'undefined' && window.currentStudyData) {
            const studyData = window.currentStudyData;
            const cleanTitle = q.question.replace(/^\[.*?\]\s*/, '').trim();
            const topicId = q.originalId || q.topic_id;
            const rowLabel = row[0] || '';
            
            if (q.mixedType === 'overview' || q.subtype === '개요' || q.question.includes('[개요 복습]')) {
              const matchedOverview = (studyData.overviews || []).find(ov => ov.id === topicId || ov.title === cleanTitle)
                || (studyData.overviews || []).find(ov => ov.title.includes(cleanTitle) || cleanTitle.includes(ov.title));
              if (matchedOverview && matchedOverview.content) {
                const parsed = localParseOverviewContent(matchedOverview.content);
                if (rowLabel && rowLabel.includes('정의') && parsed.definition) {
                  correctAnswer = parsed.definition;
                } else if (rowLabel && rowLabel.includes('메커니즘') && parsed.mechanism) {
                  correctAnswer = parsed.mechanism;
                }
              }
            } else if (q.mixedType === 'table' || q.subtype === '표채우기' || q.question.includes('[표 복습]')) {
              const matchedTable = (studyData.tables || []).find(t => t.id === topicId || t.title === cleanTitle)
                || (studyData.tables || []).find(t => t.title.includes(cleanTitle) || cleanTitle.includes(t.title));
              if (matchedTable && matchedTable.html) {
                const parsed = localParseHtmlTable(matchedTable.html);
                if (parsed.rows && parsed.rows[rIdx] && parsed.rows[rIdx][cIdx] !== undefined) {
                  correctAnswer = parsed.rows[rIdx][cIdx];
                }
              }
            }
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
export function healAnswersheetQuestionObject(a) { return healQuizQuestionObject(a); }

export const LATEX_PROMPT_INSTRUCTIONS = `
[🚨 극도로 중요한 LaTeX 수식 및 마크다운 렌더링 절대 준수 수칙]:
1. 모든 수학 공식 및 개별 물리/공학 변수 기호(예: $K_s$, $k_h$, $e$, $c$, \\phi, \\sigma, \\tau, $u$, $z_c$, $F.S.$ 등)는 단독 문장 혹은 보기, 해설 내에 노출될 때도 무조건 인라인 LaTeX 기호 포맷인 $변수명$ 형태로 감싸서 출력하십시오. 날것의 텍스트 표기(예: \\gamma_w)는 엄격히 금지합니다. 반드시 $\\gamma_w$ 와 같이 감싸십시오. 보기 문항과 해설(explanation, answer 등)에도 수식을 적극적으로 활용하되 반드시 기호로 감싸야 합니다.
2. 모든 LaTeX 명령어의 역슬래시(\\)는 JSON 파싱 에러 방지를 위해 반드시 이중 역슬래시(\\\\)로 작성하십시오. (예: \\\\frac{a}{b}, \\\\sigma, \\\\cdot 등)
3. 🚨 [대체 기호 사용 절대 금지]: JSON 파싱 에러를 우회한다는 명목으로 역슬래시(\\) 대신 샵(#) 기호나 다른 임의의 기호(예: #sigma_1, #frac, #sigma_3 등)를 LaTeX 명령어 자리에 대입하여 출력하는 행위를 엄격히 금지합니다. 수식 기호는 반드시 \\\\sigma_1, \\\\sigma_3 와 같이 이중 백슬래시로 시작하는 올바른 LaTeX 수식으로만 작성하십시오.
4. 인라인 수식 작성 시 $ 기호와 수식 내용 사이에 절대 공백(스페이스)을 두지 마십시오. (예: $수식$ (O) / $ 수식 $ (X))
5. 외부 공백 필수 조건: $ 기호의 앞과 뒤가 한글, 숫자, 문장 부호와 맞닿을 경우 반드시 앞뒤로 '한 칸의 공백(스페이스)'을 명시적으로 두어 격리하십시오. 한국어 조사('가', '는', '입니다' 등)와 결합할 때도 예외 없이 한 칸 띄우고 조사를 작성하십시오. (예: $B$ 가 4배로 증가 (O) / $B$가 4배로 증가 (X))
6. 인라인 수식 내 줄바꿈 절대 금지: 문장 중간의 $ 기호 사이 내용에서는 엔터(줄바꿈)를 절대 하지 말고 단일 줄로 이어서 작성하십시오.
7. 분수(\\\\frac), 거듭제곱근(\\\\sqrt), 미분방정식 항이 중첩된 복잡한 전개 수식은 문장 중간에 절대 섞어 쓰지 말고, 반드시 수식 블록 위아래로 빈 줄을 한 칸씩 띄운 뒤 디스플레이 수식 블록($$수식$$)으로 완벽히 독립시켜 독자 단락으로 분리 출력하십시오.
8. 단순 수치나 단위(예: 10m, 20% 등)에는 LaTeX 기호($)를 쓰지 말고 일반 텍스트로 작성하십시오.
9. 수식 내부에서 특수 기호인 '작다' 기호는 \\\\lt 로, '크다' 기호는 \\\\gt 로 표기하여 마크다운 파싱 에러를 원천 차단하십시오.
10. 아래첨자('_')나 괄호 기호 앞에 마크다운 렌더링 충돌 방지라는 핑계로 임의의 역슬래시(\\)를 붙여 시스템 깨짐(₩)을 유발하는 거동을 절대 하지 마십시오.
11. LaTeX 공식 내부 중괄호 내에 한글을 결합하는 \\\\text{한글} 과 같은 행위는 철저히 금지합니다. 한글과 만날 때는 수식을 즉시 닫고 공백을 준 뒤 한글을 배치하십시오. (예: $B$ 가 4배로 증가)
12. 달러 기호($ 또는 $$)는 반드시 수식 전체를 감싸는 가장 바깥쪽에만 위치해야 하며, 중괄호({}) 내부에 달러 기호가 침투하지 않도록 이중 마킹을 엄격히 금지합니다.
13. 🚨 [마크다운 리스트 및 줄바꿈 수칙]: JSON 응답 내에서 항목을 나열하기 위해 리스트 기호(* 또는 -)를 사용할 때는 반드시 기호 뒤에 스페이스(공백)를 한 칸 띄우고 텍스트를 작성하십시오. (예: "* k: 투수계수" (O) / "*k: 투수계수" (X)). 
14. 문단 구분이나 설명 단락 간에는 가독성을 위해 적절히 줄바꿈(두 번 엔터 \\n\\n)을 사용하여 단락을 분리하되, 과도하게 세 번 이상의 연속 빈 줄을 남발하지 마십시오.
15. 🚨 [목록 시작 시 줄 띄우기 금지]: 대주제/소주제 구분선이나 콜론으로 끝나는 행(예: "• 주요 가정:", "• 메커니즘:") 바로 다음에 목록 항목(1., 2. 또는 *, - 등)이 올 경우에는 절대로 그 사이에 빈 줄(두 번 엔터 \\n\\n)을 넣지 말고, 단일 줄바꿈(\\n)으로만 연결하여 불필요한 빈 간격이 생기지 않도록 하십시오.
16. 🚨 [HTML 태그 사용 절대 금지]: 어떠한 경우에도 답변 항목 내부에 <div>, <span>, <strong> 등 임의의 HTML 스타일 태그를 직접 작성하여 주입하지 마십시오. 레이아웃 붕괴를 유발하므로 텍스트 강조 시에는 오직 마크다운 문법(예: **강조**)을 사용하십시오.
17. 🚨 [빈 기호/제목 출력 금지]: 특정 항목(예: '메커니즘', '기본가정' 등)에 해당하는 내용이 없거나 쓸 필요가 없다면, 해당 소제목 기호나 단락 자체를 아예 생략하고 출력하지 마십시오. 빈 글머리 기호(예: "• 메커니즘:")만 덩그러니 남겨두는 행위는 엄격히 금지합니다.
18. 🚨 [수식 변수 및 아래첨자 결합 유지 규칙]: 수학 기호나 공식 내에서 물리량 변수 기호와 그 아래첨자(예: Nc, Df, kh 등)는 절대로 중간에 달러 기호($ 또는 $$)를 끼워 넣어서 서로 다른 블록으로 쪼개서 출력하지 마십시오. 반드시 수식 전체를 감싸서 하나의 수식 블록 내에 모두 포함시켜야 합니다. (예: $N_c$ (O) / N$_c$ (X), $\\text{N}_c$ (O) / \\text{N}$$_c (X))

[원시 JSON 출력 엄격 준수 규칙]
- JSON 구조 내부의 문자열에 LaTeX 수식을 작성할 때, 백슬래시(\\) 기호는 JSON 문법 표준에 의거하여 반드시 두 번 겹친 이스케이프 형태('\\\\frac', '\\\\alpha')로만 출력해야 합니다. 
- 절대로 단일 백슬래시('\\frac') 형태로 가공되지 않은 원시 문자열을 JSON 내부에 주입하여 문법 에러(Cartesian/Escape Syntax Error)를 유발하지 마십시오.

[JSON String Escape Rule]:
When generating LaTeX formulas inside a JSON string, you must strictly escape the backslash twice (e.g., "\\\\frac", "\\\\alpha") to ensure that the response remains perfectly valid for native JSON.parse() without crashing the backend system.

[🚨 수학적/산술적 검증 및 모순 방지 규칙 - 극도로 중요!]:
- 객관식 문제 출제 시, 정답("answer")으로 지정하는 값은 반드시 해설("explanation")에서 풀이하여 유도한 최종 계산값과 완벽하게 일치해야 합니다.
- 수식 계산(예: 비례/반비례 관계, 분모 분수 관계, 제곱근 및 지수 연산 등)을 수행할 때는 종이에 적듯 단계별로 산술적 검증을 한 뒤, 최종 정답값의 보기(options) 문자열이 "answer" field에 오타 없이 똑같이 들어가도록 하십시오.
- 🚨 **[반비례 및 분모 변수 변동 판단 주의]**: 변수가 공식의 분모에 위치하는 반비례 관계(예: $1/\beta \propto B^{-1/4}$)의 경우, 변수($B$)가 증가하면 값($1/\beta$)은 반드시 감소해야 합니다. 분모에 변수가 있어 감소해야 하는 물리적 사실을 무시하고 오히려 증가한다고 결론 내리는 수학적/논리적 모순적 환각(Hallucination)을 절대로 저지르지 마십시오.
- 예를 들어 해설에서 '1/4배(0.25배)가 된다'고 올바르게 풀이해 놓고, 정답 필드("answer")에 '0.125배' 또는 '2배 증가' 같은 엉뚱한 값을 세팅하는 논리적 모순/환각을 절대 저지르지 마십시오.
`;

export const LATEX_CHAT_PROMPT_INSTRUCTIONS = `
[🚨 극도로 중요한 LaTeX 수식 및 마크다운 렌더링 절대 준수 수칙]:
0. 🚨 [절대 금지 - JSON 응답 금지]: 당신은 실시간 대화형 챗봇/해설사이므로 절대로 JSON 형식(예: {"concept": "...", "explanation": "..."})으로 응답을 감싸서 출력하지 마십시오. 중괄호({ })나 큰따옴표가 들어간 JSON 키-값 구조는 렌더링 오류를 발생시킵니다. 오직 일반적인 한글 대화 문장 및 마크다운 포맷으로만 직접 답변하십시오.
1. 모든 수학 공식 및 개별 물리/공학 변수 기호(예: $K_s$, $k_h$, $e$, $c$, \\phi, \\sigma, \\tau, $u$, $z_c$, $F.S.$ 등)는 단독 문장 혹은 보기, 해설 내에 노출될 때도 무조건 인라인 LaTeX 기호 포맷인 $변수명$ 형태로 감싸서 출력하십시오. 날것의 텍스트 표기(예: \\gamma_w)는 엄격히 금지합니다. 반드시 $\\gamma_w$ 와 같이 감싸십시오. 답변에도 수식을 적극적으로 활용하되 반드시 기호로 감싸야 합니다.
2. 모든 LaTeX 명령어의 역슬래시(\\)는 단일 역슬래시(\\frac, \\sigma)로 작성하십시오. (※ JSON이 아닌 일반 마크다운 출력이므로 이중 역슬래시가 아닌 단일 역슬래시로 출력해야 정상 렌더링됩니다.)
3. 🚨 [대체 기호 사용 절대 금지]: 역슬래시(\\) 대신 샵(#) 기호나 다른 임의의 기호(예: #sigma_1, #frac, #sigma_3 등)를 LaTeX 명령어 자리에 대입하여 출력하는 행위를 엄격히 금지합니다. 수식 기호는 반드시 \\sigma_1, \\sigma_3 와 같이 올바른 백슬래시 기호로만 작성하십시오.
4. In라인 수식 작성 시 $ 기호와 수식 내용 사이에 절대 공백(스페이스)을 두지 마십시오. (예: $수식$ (O) / $ 수식 $ (X))
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
19. 🚨 [빈 기호/제목 출력 금지]: 특정 항목(예: '메커니즘', '기본가정' 등)에 해당하는 내용이 없거나 쓸 필요가 없다면, 해당 소제목 기호나 단락 자체를 아예 생략하고 출력하지 마십시오. 빈 글머리 기호(예: "• 메커니즘:")만 덩거리니 남겨두는 행위는 엄격히 금지합니다.
16. 🚨 [표(Table) 작성 철칙]: 답변 중 지표, 수치 비교, 매개변수 정리 등 표(Table) 형태의 데이터 표현이 필요한 경우, HTML이나 LaTeX tabular/matrix/array 환경을 사용하지 말고 반드시 표준 **마크다운 표(Markdown Table)** 형식(| 열1 | 열2 |과 구분선 | --- | --- |)으로만 작성하십시오.
17. 🚨 [컨테이너 중첩 절대 금지]: 여러 개의 수식 전개 과정이나 한글 설명 리스트 전체를 하나의 거대한 디스플레이 수식 블록($$...$$)으로 통째로 감싸지 마십시오. 반드시 개별 공식마다 독립된 $ 기호만 사용하십시오.
18. 🚨 [달러 기호 매칭 오류 및 이탈 방지 규칙]: 리스트 기호나 숫자가 포함된 번호 매기기(예: "1) 연성 벽체...", "2) 고강성...")가 포함된 문단 내에서 공식들을 나열할 때, 각 공식들은 개별적으로 완벽히 수식 기호($)로 열고 닫혀 있어야 합니다. 절대로 여는 수식 기호가 없는 상태에서 닫는 수식 기호만 배치하거나, 혹은 어설프게 매칭되어 한글 제목 전체가 수식 영역 안으로 빨려 들어가지 않도록 극도로 유의하십시오.
    - ❌ [절대 금지 오류 예시]: d_{H,max1} = ... $ 2) CIP 공법 적용 시: $ d_{H,max2} = ... (중간 한글 제목이 달러 기호에 갇히는 형태는 렌더링을 완전히 망가뜨립니다.)
20. 🚨 [수식 변수 및 아래첨자 결합 유지 규칙]: 수학 기호나 공식 내에서 물리량 변수 기호와 그 아래첨자(예: Nc, Df, kh 등)는 절대로 중간에 달러 기호($ 또는 $$)를 끼워 넣어서 서로 다른 블록으로 쪼개서 출력하지 마십시오. 반드시 수식 전체를 감싸서 하나의 수식 블록 내에 모두 포함시켜야 합니다. (예: $N_c$ (O) / N$_c$ (X), $\\text{N}_c$ (O) / \\text{N}$$_c (X))
`;
// Trigger redeployment with clean UTF-8 BOM-less encoding.

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
