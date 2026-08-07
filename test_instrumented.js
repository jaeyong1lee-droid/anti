
  const { healInvertedDelimiters, healCorruptedKatexHtml } = require('./client/src/utils/latexUtils.js');
  let _dbg = '';
  function healLatexFormulas($), 일반 텍스트, 그리고 보호된 표 블록 분리 (인라인 줄바꿈 오염 방지)export function tokenizeForHealing(text) {
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

export function parseMarkdownTable(questionText) {
  if (!questionText) return null;
  const cleanStr = typeof questionText === 'string' ? questionText : String(questionText);
  const normalizedStr = cleanStr.replace(/<br\s*\/?>/gi, '\n');
  const lines = normalizedStr.split('\n');
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line.includes('|')) {
      const nextLine = lines[i + 1].trim();
      const isSeparator = nextLine.includes('-') && nextLine.includes('|') && /^[\s|:\-]+$/.test(nextLine);
      if (isSeparator) {
        const parseRow = (l) => {
          let trimmed = l.trim();
          if (trimmed.startsWith('|')) trimmed = trimmed.substring(1);
          if (trimmed.endsWith('|')) trimmed = trimmed.substring(0, trimmed.length - 1);
          return trimmed.split('|').map(cell => cell.replace(/<[^>]*>/g, '').trim());
        };

        const headers = parseRow(lines[i]);
        const dataRows = [];
        let j = i + 2;
        while (j < lines.length) {
          const rowLine = lines[j].trim();
          if (rowLine.includes('|')) {
            const parsedCells = parseRow(rowLine);
            if (parsedCells.length > 0 && !parsedCells.every(c => !c || c.includes('---'))) {
              dataRows.push(parsedCells);
            }
          } else if (rowLine !== '' && !rowLine.startsWith('<')) {
            break;
          }
          j++;
        }

        if (headers.length > 0 && dataRows.length > 0) {
          const hasBulletsInCol0 = dataRows.some(r => String(r[0] || '').startsWith('•') || String(r[0] || '').startsWith('-'));

          let finalRows = dataRows;
          if (hasBulletsInCol0) {
            const consolidated = [];
            let curSection = null;
            let curCol1Bullets = [];
            let curCol2Bullets = [];

            const flushSection = () => {
              if (curSection) {
                const col1Text = curCol1Bullets.join('\n');
                const col2Text = curCol2Bullets.join('\n');
                consolidated.push([curSection, col1Text, col2Text]);
              }
              curSection = null;
              curCol1Bullets = [];
              curCol2Bullets = [];
            };

            for (const r of dataRows) {
              const cleanHtmlStr = (s) => String(s || '').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&').replace(/<[^>]*>/g, '').trim();
              const col0 = cleanHtmlStr(r[0]);
              const col1 = String(r[1] || '').trim();
              const col2 = String(r[2] || '').trim();

              if (col0.startsWith('•') || col0.startsWith('-')) {
                if (curCol1Bullets.length === 0) {
                  curCol1Bullets.push(col0);
                } else if (curCol2Bullets.length === 0 && headers.length >= 3) {
                  curCol2Bullets.push(col0);
                } else {
                  curCol1Bullets.push(col0);
                }
              } else {
                flushSection();
                if (col1 || col2) {
                  consolidated.push([col0, col1, col2]);
                } else {
                  curSection = col0;
                }
              }
            }
            flushSection();
            if (consolidated.length > 0) {
              finalRows = consolidated;
            }
          }

          const originalTableText = lines.slice(i, j).join('\n');
          return {
            tableData: { headers, rows: finalRows },
            originalTableText
          };
        }
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
  // 3. Subscripted variables with braces or underscores (e.g. s_{t-\Delta t}, s_{t- \Delta t}, S_{max}, k_h, z_c)
  `\\\\?[a-zA-Z0-9_']+_\{\\s*[^{}\\n]+\\s*\\}|` +
  `\\b[a-zA-Z0-9]+_[a-zA-Z0-9_']+\\b|` +
  // 4. Constants
  `\\b(?:EI|EA|FS)\\b|` +
  `\\bF\\.S\\.(?![a-zA-Z0-9_'])`,
  'g'
);

function replaceRoots(str) {
  let processed = str;
  processed = processed.replace(/√(?!\()/g, '\\sqrt ');
if (processed !== _dbg) { console.log('Line 807:', processed); _dbg = processed; }

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

export function balanceMathBraces(str) {
  if (!str || typeof str !== 'string') return str;
  
  let depth = 0;
  let result = '';
  let i = 0;

  while (i < str.length) {
    const char = str[i];
    
    let backslashCount = 0;
    let k = i - 1;
    while (k >= 0 && str[k] === '\\') {
      backslashCount++;
      k--;
    }
    const isEscaped = (backslashCount % 2 === 1);

    if (char === '{' && !isEscaped) {
      depth++;
      result += char;
    } else if (char === '}' && !isEscaped) {
      if (depth > 0) {
        depth--;
        result += char;
      } else {
        // Orphan closing brace with depth 0 -> drop it!
      }
    } else {
      result += char;
    }
    i++;
  }

  if (depth > 0) {
    result += '}'.repeat(depth);
  }

  return result;
}

const healCorruptedKatexHtml = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text.replace(/\u200b/g, '');
  
  const cleanAndSplitFormula = (formula) => {
    let clean = (formula || '').trim().replace(/\\+/g, '\\').replace(/₩/g, '\\');
    // Decode basic HTML entities inside formula before parsing/splitting
    clean = clean.replace(/&#x27;/g, "'")
                 .replace(/&quot;/g, '"')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&amp;/g, '&');

    clean = balanceMathBraces(clean);
                 
    // Split by any HTML tags (e.g. </div>, <br>, <a/>)
    const parts = clean.split(/(?:<[^>]+?>)/gi);
    return parts.map(p => {
      const trimmed = balanceMathBraces(p.trim());
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
      let msg = titleMatch[1];
      const posIdx = msg.indexOf('at position ');
      if (posIdx !== -1) {
        const colonAfter = msg.indexOf(':', posIdx);
        if (colonAfter !== -1) {
          msg = msg.substring(colonAfter + 1);
        }
      }
      msg = msg.replace(/^\s*\.\.\.\s*/, '');
      msg = balanceMathBraces(msg.trim());
      if (!msg) return '';
      return cleanAndSplitFormula(msg);
    }
    let cleanedErr = balanceMathBraces(errContent.trim());
    if (!cleanedErr) return '';
    return cleanedErr;
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


  
  const text = '특히 $\sqrt{$ $\sqrt{\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';
  _dbg = text;
  console.log('Original:', text);
  console.log('Final:', healLatexFormulas(text));
