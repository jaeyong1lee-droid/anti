// 1. 수식($), 일반 텍스트, 그리고 보호된 블록 분리 (인라인 줄바꿈 오염 방지)
export function tokenizeForHealing(text) {
  if (!text) return [];
  const tokens = [];
  let lastIndex = 0;
  // Match code blocks, HTML tags, or inline/display math blocks
  const htmlTags = ['strong', 'em', 'sub', 'sup', 'div', 'span', 'br', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'p', 'b', 'i', 'u'];
  const tagsRegex = htmlTags.join('|');
  const regex = new RegExp(`(\`\`\`[\\s\\S]*?\`\`\`)|(<\\/?\\s*(?:${tagsRegex})\\b(?:\\s+[^>]*)?>)|(\\$\\$[\\s\\S]*?\\$\\$)|(\\$\\s?[^\\$\\n]{1,200}\\s?\\$)`, 'gi');
  let match;

  while ((match = regex.exec(text)) !== null) {
    const before = text.substring(lastIndex, match.index);
    if (before) tokens.push({ type: 'text', content: before });
    
    const content = match[0];
    if (content.startsWith('```')) {
      tokens.push({ type: 'code', content });
    } else if (content.startsWith('<')) {
      tokens.push({ type: 'html', content });
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
        // Orphan closing brace with depth 0 -> keep it to prevent collapsing to empty $$
        result += char;
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
export function healLatexFormulas(text, isNested = false, passedPoissonSymbol = null, forceInline = false) {
  if (!text || typeof text !== 'string') return text;

  // [Self-Healing] Fix spaced-out formatting tags hallucinated by AI
  const formatTags = ['strong', 'em', 'b', 'i', 'u', 'span', 'div', 'p', 'br', 'table', 'tr', 'td', 'th', 'tbody', 'thead'];
  const formatRegex = new RegExp(`(<\\s*\\/?\\s*)(${formatTags.join('|')})\\b(\\s*[^>]*)?>`, 'gi');
  text = text.replace(formatRegex, (match, prefix, tag, suffix) => {
    const isClosing = prefix.includes('/');
    return (isClosing ? '</' : '<') + tag + (suffix ? suffix.trim() : '') + '>';
  });

  text = text.replace(/<\s*\/\s*sub\s*>/gi, '');
  text = text.replace(/\s*<\s*sub\s*>\s*/gi, '_');
  text = text.replace(/<\s*\/\s*sup\s*>/gi, '');
  text = text.replace(/\s*<\s*sup\s*>\s*/gi, '^');
  text = text.replace(/\([₩\\]?t\)/gi, '($\\Delta t$)');

  text = text.replace(/₩/g, '\\').replace(/\\\(([\\s\\S]*?)\\\)/g, (m, p1) => '$' + p1.trim() + '$');
  let processed = healCorruptedKatexHtml(text);
  
  processed = processed.replace(/(?<!\$)\$\s+\$(?!\$)/g, ' ');
  processed = processed.replace(/\$\s*\\sqrt\{\s*\\sqrt\{\\dots\}\s*\}\s*\$\s*/g, '');
  processed = processed.replace(/\(([^()\n]*?)\$\$\s*([\\s\\S]*?)\s*\$\$\s*([^()\n]*?)\)/g, '($1 $$$2$$ $3)');
  processed = processed.replace(/([([\\uAC00-\\uD7A3a-zA-Z0-9,])\s*\$\$\s*([^\$\n]+?)\s*\$\$\s*([)\],\\.\\uAC00-\\uD7A3a-zA-Z0-9,])/g, '$1 $$$2$$ $3');
  processed = processed.replace(/\(([^$()\n]+?)\$\)/g, '($$$1$)');

  processed = processed.replace(/&amp;\\?lt;?/gi, '<').replace(/&amp;\\?gt;?/gi, '>');
  processed = processed.replace(/&\\lt;?/gi, '<').replace(/&\\gt;?/gi, '>');
  processed = processed.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  processed = processed.replace(/\\text\{\s*W유\s*\}m?/gi, '\\mu m').replace(/W유m?/gi, '\\mu m');

  const greekSubscriptFullLetters = 'alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa';
  const spaceRegex = new RegExp(`\\\\\\s+(${greekSubscriptFullLetters})([a-zA-Z0-9]*)\\b`, 'gi');
  processed = processed.replace(spaceRegex, '\\$1$2');

  const greekSubscriptLetters = 'sigma|gamma|tau|theta|alpha|beta|epsilon|phi|psi|omega|mu|nu';
  const greekSubscriptRegex = new RegExp(`\\\\(${greekSubscriptLetters})('?)([a-zA-Z0-9])\\b`, 'gi');
  processed = processed.replace(greekSubscriptRegex, '\\$1$2_$3');

  processed = formatConsecutiveFormulas(processed);

  processed = processed.replace(/(\$\s?[^\$]+\s?\$)(은|는|이|가|을|를|의|로|으로|에|에서|와|과|도|만|일때|입니다|라하면|값은)/g, '$1 $2');
  processed = processed.replace(/\$?\\[\s*INPUT_(\d+(?:_\d+)?)\s*\\]\$?|\$?\\[\s*INPUT_(\d+(?:_\d+)?)\s*\\]\$?|\$\[\s*INPUT_(\d+(?:_\d+)?)\s*\]\$/gi, '[INPUT_$1]');

  return processed.trim();
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
    if (/^(data:image\/|https?:\/\/|\/)/i.test(obj)) {
      return obj;
    }
    const skipKeys = [
      'title', 'pdf_name', 'pdf_url', 'id', 'topic_id', 'schedule_id', 
      'answersheet_report_id', 'type', 'subtype', 'keywords',
      'imageSrc', 'image_src', 'imageSrcs', 'image_srcs',
      'base64Image', 'base64_image', 'base64Images', 'base64_images',
      'originalId', 'original_id', 'memorizationTip', 'memorization_tip'
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

export function cleanQuizQuestion(q) {
  if (!q) return q;
  let cleanText = typeof q === 'string' ? q : String(q || '');

  // 1. Replace (A), (B), (C), (D) list garbage inside flowchart boxes with sequential single placeholders
  let emptyBoxIdx = 0;
  cleanText = cleanText.replace(/\[\s*\([^\]]*\)\s*,\s*\([^\]]*\)[\s\S]*?\]/gi, () => {
    emptyBoxIdx++;
    return emptyBoxIdx === 1 ? '[ (A) ]' : (emptyBoxIdx === 2 ? '[ (C) ]' : '[ (E) ]');
  });

  let emptyLineIdx = 0;
  cleanText = cleanText.replace(/-\s*\([^)]*\)\s*,\s*\([^)]*\)[\s\S]*?(?=\r?\n|$)/gi, () => {
    emptyLineIdx++;
    return emptyLineIdx === 1 ? '- (B)' : (emptyLineIdx === 2 ? '- (D)' : '- (F)');
  });

  // 2. Strip remaining list garbage outside boxes
  cleanText = cleanText.replace(/,?\s*\([A-Z]\)(?:\s*,\s*\([A-Z]\))+/gi, '');

  const hasTableOrFlowchart = cleanText.includes('|') || cleanText.includes('┌──') || cleanText.includes('▼') || cleanText.includes('```') || cleanText.includes('흐름도') || cleanText.includes('플로우차트');
  if (hasTableOrFlowchart) return cleanText.trim();
  return cleanText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sanitizeGarbageTextFromQuestion(text) {
  if (!text || typeof text !== 'string') return text;
  let clean = text;
  clean = clean.replace(/,?\s*\([B-F]\)\s*(?:,\s*\([B-F]\))+/g, '');
  clean = clean.replace(/,?\s*\(([A-F])\)\s*입력\s*,?\s*\([B-F]\)\s*(?:,\s*\([B-F]\))+/g, ' ($1) 입력');
  return clean;
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

export const parseOverviewContent = (content) => {
  const result = { definition: '', mechanism: '', comparison: '', significance: '', intuitive: '' };
  if (!content) return result;

  let healedContent = typeof content === 'string' ? content : String(content || '');
  healedContent = healedContent.replace(/\|\s*(개요\(\d+~\d+자\)|개요|정의|메커니즘|작동 메커니즘|공학적 작동 메커니즘|발생 메커니즘|기전|비교표|비교|장단점|의미|한계성|직관적의미|직관적)\s*\|/gi, '\n| $1 |');
  healedContent = healedContent.replace(/\|[ \t]*\|/g, '\n|');

  const lines = healedContent.split('\n');
  let currentKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '|') continue;
    
    if ((trimmed.includes(':---') || (trimmed.startsWith('|') && trimmed.includes('구분') && trimmed.includes('내용'))) && !currentKey) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\|\s*([^|]+)\s*\|?\s*([\s\S]*)$/);
    const rawKeyCandidate = sectionMatch ? sectionMatch[1].trim() : '';
    const isTopLevelKey = 
      rawKeyCandidate.includes('개요') || 
      rawKeyCandidate.includes('정의') ||
      rawKeyCandidate.includes('메커니즘') || 
      rawKeyCandidate.includes('기전') || 
      rawKeyCandidate.includes('비교') || 
      rawKeyCandidate.includes('장단점') || 
      rawKeyCandidate.includes('의미') || 
      rawKeyCandidate.includes('한계성') || 
      rawKeyCandidate.includes('직관적');

    if (sectionMatch && isTopLevelKey) {
      const rawKey = sectionMatch[1].trim();
      let rawVal = sectionMatch[2].trim();
      
      if (rawVal.endsWith('|')) {
        rawVal = rawVal.slice(0, -1).trim();
      }

      if (rawKey.includes('개요') || rawKey.includes('정의')) {
        currentKey = 'definition';
      } else if (rawKey.includes('메커니즘') || rawKey.includes('기전')) {
        currentKey = 'mechanism';
      } else if (rawKey.includes('직관적')) {
        currentKey = 'intuitive';
      } else if (rawKey.includes('비교') || rawKey.includes('비교표') || rawKey.includes('장단점')) {
        currentKey = 'comparison';
      } else if (rawKey.includes('의미') || rawKey.includes('한계성')) {
        currentKey = 'significance';
      }

      result[currentKey] = rawVal;
    } else {
      if (currentKey) {
        result[currentKey] += '\n' + trimmed;
      }
    }
  }

  for (const k in result) {
    result[k] = result[k].replace(/<br\s*\/?>/gi, '\n').trim();
    if (result[k].endsWith('|') && !result[k].includes('\n')) {
      result[k] = result[k].slice(0, -1).trim();
    }
  }

  if (!result.definition && !result.mechanism && !result.comparison && !result.significance && !result.intuitive && content) {
    result.definition = typeof content === 'string' ? content.trim() : String(content).trim();
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
    if (q.question && typeof q.question === 'string') {
      q.question = cleanQuizQuestion(q.question);
      // 1. MIT 방식 명칭 노출 방지 사후 보정
      if (q.question.includes('MIT 방식의')) {
        q.question = q.question.replace(/MIT\s*방식의\s*/g, '');
      }
      if (q.question.includes('MIT 방식')) {
        q.question = q.question.replace(/MIT\s*방식\s*/g, '');
      }


      
      // 2. p' q 공식 누락 문제 실시간 복원
      if (q.question.includes("평균 응력 $p'$ 와 축차응력 $q$ 가 각각 다음과 같을 때") && !q.question.includes('=')) {
        q.question = q.question.replace(
          "평균 응력 $p'$ 와 축차응력 $q$ 가 각각 다음과 같을 때",
          "평균 유효응력 $p' = \\frac{\\sigma'_1 + \\sigma'_3}{2}$ 와 축차응력 $q = \\frac{\\sigma_1 - \\sigma_3}{2}$ 가 각각 정의될 때"
        );
      }
    }

    // Real-time healing for overview questions to ensure both 학술적 정의 & 공학적 작동 메커니즘 are present
    if ((q.mixedType === 'overview' || String(q.question || '').includes('[개요 복습]')) && q.tableData) {
      const mainHeaders = (q.tableData.headers || []).join(',');
      const compHeaders = (q.comparisonTableData?.headers || []).join(',');
      const isDuplicated = q.comparisonTableData && mainHeaders === compHeaders && mainHeaders !== '구분,내용';

      if (isDuplicated) {
        const parsed = parseOverviewContent(q.explanation || q.content || '');
        const answers = { ...(q.answers || {}) };
        const rows = [];
        if (parsed.definition || q.tableData.rows?.[0]?.[1]) {
          const defVal = parsed.definition || q.answers?.['INPUT_0_1'] || q.answer || '';
          answers['INPUT_0_1'] = defVal;
          rows.push(['학술적 정의', '[INPUT_0_1]']);
        }
        
        const mechVal = parsed.mechanism || parsed.intuitive || parsed.significance || (q.explanation ? q.explanation.replace(/<[^>]*>/g, '').trim() : '');
        if (mechVal) {
          const rowIdx = rows.length;
          answers[`INPUT_${rowIdx}_1`] = mechVal;
          rows.push(['공학적 작동 메커니즘', `[INPUT_${rowIdx}_1]`]);
        }

        if (rows.length > 0) {
          q.tableData = {
            headers: ['구분', '내용'],
            rows: rows
          };
          q.answers = answers;
        }
      }

      if (q.comparisonTableData && q.comparisonTableData.rows && q.answers) {
        const mainRowsCount = q.tableData?.rows?.length || 2;
        q.comparisonTableData.rows = q.comparisonTableData.rows.map((row, rIdx) => {
          if (!Array.isArray(row)) return row;
          return row.map((cell, cIdx) => {
            if (cIdx === 0) return cell;
            let currentId = typeof cell === 'string' && cell.includes('[INPUT_')
              ? cell.replace('[', '').replace(']', '').trim()
              : `INPUT_${rIdx}_${cIdx}`;
            
            const match = currentId.match(/^INPUT_(\d+)_(\d+)$/i);
            let finalId = currentId;
            if (match) {
              const r = parseInt(match[1], 10);
              const c = parseInt(match[2], 10);
              if (r < mainRowsCount) {
                finalId = `INPUT_${mainRowsCount + r}_${c}`;
                if (q.answers[currentId] && !q.answers[finalId]) {
                  q.answers[finalId] = q.answers[currentId];
                }
              }
            }
            if (!q.answers[finalId] && q.answers[currentId]) {
              q.answers[finalId] = q.answers[currentId];
            }
            return `[${finalId}]`;
          });
        });
      }
    }

    // For multiple choice questions, heal mismatched answer field
    if (q.options && Array.isArray(q.options) && q.answer) {
      // 0. index형태 답안 ("1번", "①" 등) 보정 처리
      let matchedIndex = -1;
      const cleanAns = String(q.answer).trim().toLowerCase();
      if (cleanAns === '1번' || cleanAns === '①' || cleanAns === '보기1' || cleanAns === '보기 1' || cleanAns === '1') {
        matchedIndex = 0;
      } else if (cleanAns === '2번' || cleanAns === '②' || cleanAns === '보기2' || cleanAns === '보기 2' || cleanAns === '2') {
        matchedIndex = 1;
      } else if (cleanAns === '3번' || cleanAns === '③' || cleanAns === '보기3' || cleanAns === '보기 3' || cleanAns === '3') {
        matchedIndex = 2;
      } else if (cleanAns === '4번' || cleanAns === '④' || cleanAns === '보기4' || cleanAns === '보기 4' || cleanAns === '4') {
        matchedIndex = 3;
      }
      
      if (matchedIndex !== -1 && q.options.length > matchedIndex) {
        const exactMatchIndex = q.options.indexOf(q.answer);
        if (exactMatchIndex === -1) {
          console.log(`[HealMC] Mapping index-based answer "${q.answer}" to option[${matchedIndex}]: "${q.options[matchedIndex]}"`);
          q.answer = q.options[matchedIndex];
        }
      }

      // 1. 배율 왜곡(10배/100배 스케일링 오염) 복원 처리
      const optNums = q.options.map(o => parseFloat(String(o || '').replace(/[^0-9.-]/g, ''))).filter(n => !isNaN(n));
      const ansNum = parseFloat(String(q.answer || '').replace(/[^0-9.-]/g, ''));
      if (optNums.length === q.options.length && !isNaN(ansNum) && ansNum > 0 && ansNum < 1) {
        const hasScaledMatch = optNums.some(n => Math.abs(n - ansNum * 100) < 1e-5 || Math.abs(n - ansNum * 10) < 1e-5);
        const allLargeOrZero = optNums.every(n => n === 0 || n >= 1);
        if (hasScaledMatch && allLargeOrZero) {
          console.log(`[HealMC] Detected scaled options. Restoring options from ${JSON.stringify(q.options)} using answer ${q.answer}`);
          q.options = q.options.map(opt => {
            const num = parseFloat(String(opt || '').replace(/[^0-9.-]/g, ''));
            if (isNaN(num)) return opt;
            const restoredVal = (num / 100).toFixed(2);
            return restoredVal;
          });
          console.log(`[HealMC] Restored options: ${JSON.stringify(q.options)}`);
        }
      }

      const hasExactMatch = q.options.includes(q.answer);
      if (!hasExactMatch) {
        let bestOpt = null;
        let maxScore = -1;
        
        const getOptionMatchScore = (opt, answer) => {
          const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
          const cOpt = clean(opt);
          const cAns = clean(answer);
          
          if (cOpt === cAns) return 1000;
          
          const sOpt = String(opt || '');
          const sAns = String(answer || '');
          if (sOpt.includes('=')) {
            const parts = sOpt.split('=');
            const rhs = parts[parts.length - 1];
            if (clean(rhs) === cAns) return 900;
          }
          
          if (sOpt.trim().endsWith(sAns.trim())) return 800;
          if (sOpt.trim().startsWith(sAns.trim())) return 700;
          
          if (cAns && cOpt && (cOpt.includes(cAns) || cAns.includes(cOpt))) {
            const diff = Math.abs(cOpt.length - cAns.length);
            return 500 - diff;
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
        cell.includes('입력') ||
        /빈칸\s*\(?\d+\)?/i.test(cell) || 
        /^\s*[\[\(]?\s*[A-Za-z]\s*[\]\)]?\s*$/i.test(cell) ||
        /[A-Za-z]\s*입력/i.test(cell)
      ))
    );

    // ---------------------------------------------------------
    // [Calculation Question Dynamic Items Healer]
    // ---------------------------------------------------------
    const qText = q.question || '';
    const isExplicitCompOrTheory = /비교하시오|특성을\s*비교|차이점|서술하시오|설명하시오/i.test(qText);
    const hasCalcHeaders = q.tableData && Array.isArray(q.tableData.headers) && (
      q.tableData.headers[0] === '구하는 항목' || q.tableData.headers[1] === '계산 결과 및 답안'
    );

    const hasMultipleSubItems = /(?:\(1\)|①).*?(?:\(2\)|②)/.test(qText);
    const hasCalcKeyword = /구하시오|산정하시오|계산하시오|결정하시오/i.test(qText);

    const isCalcQ = !isExplicitCompOrTheory && (
      q.type === '주관식 (계산)' || 
      q.subtype === '계산' || 
      hasCalcHeaders ||
      (/Terzaghi|기초|지지력|허용하중|침투유량|침투수량|간극수압|동수경사|안전율/i.test(qText) && /산정|계산|구하시오/i.test(qText)) ||
      (hasMultipleSubItems && hasCalcKeyword)
    );

    if (isCalcQ) {
      q.type = '주관식 (계산)';
      q.subtype = '계산';

      // 1. 최우선순위: LLM이 표(tableData)를 명시적으로 생성했다면 그것을 기반으로 calcItems 구성
      if (!q.calcItems || q.calcItems.length === 0) {
        if (q.tableData && Array.isArray(q.tableData.rows)) {
          const validRows = q.tableData.rows.filter(r => Array.isArray(r) && typeof r[0] === 'string' && !/핵심\s*(?:수치\s*)?계산\s*항목/i.test(r[0]));
          if (validRows.length > 0) {
            q.calcItems = validRows.map((row, rIdx) => ({
              id: `INPUT_${rIdx + 1}`,
              label: row[0]
            }));
          }
        }
      }

      // 2. 만약 여전히 calcItems가 없거나, 너무 포괄적/더미(Generic) 텍스트라면 정규식을 통해 본문에서 추출
      const isGeneric = !q.calcItems || q.calcItems.length === 0 || (
        Array.isArray(q.calcItems) && q.calcItems.some(it => /(?:핵심|수치)\s*(?:계산|산출)\s*(?:요구\s*)?항목/i.test(it.label || ''))
      ) || (
        Array.isArray(q.calcItems) && q.calcItems.some(it => /^[\(\[]?\d+[\)\]]?\s*수치\s*(?:계산|산출)/i.test(it.label || ''))
      ) || (
        Array.isArray(q.calcItems) && q.calcItems.some(it => /빈칸에\s*알맞/i.test(it.label || ''))
      );

      if (isGeneric) {
        // 1. Extract numbered items from question text (e.g. (1) ..., (2) ... or ①, ②...)
        const itemMatches = [...qText.matchAll(/(?:\((\d+)\)|(\d+)\)|①|②|③|④|⑤|⑥)\s*([\s\S]+?(?=(?:\(\d+\)|[2-9]\)|①|②|③|④|⑤|⑥|\n|$)))/g)];
        if (itemMatches.length >= 2) {
          q.calcItems = itemMatches.map((m, i) => ({
            id: `INPUT_${i + 1}`,
            label: `(${i + 1}) ${(m[3] || m[0]).replace(/^[\(\[\d\s\)\]①-⑥]+/, '').replace(/[,.\s]+$/, '').trim()}`
          }));
        } else {
          // 2. Extract target items before action verbs (구하시오, 나타내시오, 산정하시오, 계산하시오)
          const targetMatch = qText.match(/(?:을|를|값과|값을|항목을|결과를)\s*([^,.\n]+?)(?:를|을|값)?\s*(?:구하시오|나타내시오|산정하시오|계산하시오|평가하시오|작성하시오)/i);
          if (targetMatch && targetMatch[1]) {
            const rawTerms = targetMatch[1].split(/(?:및|와|과|,|\/)/).map(t => t.trim()).filter(Boolean);
            if (rawTerms.length >= 1) {
              q.calcItems = rawTerms.map((term, idx) => ({
                id: `INPUT_${idx + 1}`,
                label: `(${idx + 1}) ${term}`
              }));
            }
          }
          // 3. Extract math symbols ($S_i$, $\phi$, etc.) from question text
          if (!q.calcItems || q.calcItems.length === 0 || q.calcItems.some(it => /빈칸에\s*알맞/i.test(it.label || ''))) {
            const latexSymbols = [...qText.matchAll(/\$([A-Za-z0-9_\\\{\}]+)\$/g)].map(m => m[1]);
            if (latexSymbols.length >= 1) {
              const uniqueSyms = [...new Set(latexSymbols)];
              q.calcItems = uniqueSyms.map((sym, idx) => ({
                id: `INPUT_${idx + 1}`,
                label: `(${idx + 1}) 변수 $${sym}$ 정량 산출값`
              }));
            }
          }
          // 4. Extract step headers from explanation if available
          if ((!q.calcItems || q.calcItems.length === 0 || q.calcItems.some(it => /빈칸에\s*알맞/i.test(it.label || ''))) && q.explanation) {
            const expSteps = [...q.explanation.matchAll(/(?:^|\n)\s*(?:[1-9]\)|[\(\[]\d+[\)\]]|①|②|③|④|⑤)\s*([^=\n:+]{2,30})/g)];
            if (expSteps.length >= 2) {
              q.calcItems = expSteps.map((m, i) => ({
                id: `INPUT_${i + 1}`,
                label: `(${i + 1}) ${m[1].trim()}`
              }));
            }
          }
        }
      }

      if (Array.isArray(q.calcItems) && q.calcItems.length > 0) {
        if (!q.answers) q.answers = {};
        q.calcItems.forEach((it, idx) => {
          const key = it.id || `INPUT_${idx + 1}`;
          if (!q.answers[key]) {
            q.answers[key] = it.modelAnswer || it.correctAnswer || it.label || `(${idx + 1}) 수치 계산 수치값`;
          }
          
          // [HEAL] Append context to extremely generic labels like "(A)", "(B)", "(1)" generated by AI for image questions
          const rawLabel = it.label || '';
          const stripped = rawLabel.replace(/[\(\)\[\]A-Z0-9\s]/ig, '');
          if (stripped.length < 2 && q.answers[key]) {
             const ansText = String(q.answers[key]).replace(/<[^>]+>/g, '').trim();
             if (ansText.length > 0) {
                 it.label = `${rawLabel} 💡힌트: ${ansText}`;
             }
          }
        });
      }
    }

    if (q.type === '주관식 (표채우기)' || q.subtype === '표채우기') {
      if (q.tableData && Array.isArray(q.tableData.headers)) {
        q.tableData.headers = q.tableData.headers.map((h, hIdx) => {
          if (hIdx === 0 || typeof h !== 'string') return h;
          let cleanH = h.trim();
          if (cleanH.includes(':')) cleanH = cleanH.split(':')[0].trim();
          if (cleanH.includes('：')) cleanH = cleanH.split('：')[0].trim();

          if (/보고서\s*특성\s*1|특성\s*1/i.test(cleanH)) {
            cleanH = '주요 핵심 역학/해석 특성';
          } else if (/보고서\s*특성\s*2|특성\s*2/i.test(cleanH)) {
            cleanH = '대조 관련 공법 및 파괴기준';
          }
          return cleanH;
        });
      }

      if (q.tableData && Array.isArray(q.tableData.rows)) {
        q.tableData.rows = q.tableData.rows.map((row) => {
          if (!Array.isArray(row)) return row;
          return row.map((cell, cIdx) => {
            if (cIdx === 0 || typeof cell !== 'string') return cell;
            if (/^[A-Z]\s*입력$/i.test(cell.trim()) || cell.trim() === 'A 입력' || cell.trim() === 'B 입력' || cell.trim() === 'C 입력') {
              return `[INPUT_${cIdx}]`;
            }
            return cell;
          });
        });
      }
      if (q.tableData && Array.isArray(q.tableData.headers)) {
        q.tableData.headers = q.tableData.headers.map((h, hIdx) => {
          if (hIdx === 0 || typeof h !== 'string') return h;
          let cleanH = h.trim();
          if (cleanH.includes(':')) {
            cleanH = cleanH.split(':')[0].trim();
          } else if (cleanH.includes('：')) {
            cleanH = cleanH.split('：')[0].trim();
          }
          const parenMatch = cleanH.match(/^((?:조건|Case|경우)\s*[\(\[]?[A-Za-z0-9가-힣]+[\)\]]?)/i);
          if (parenMatch) {
            cleanH = parenMatch[1].trim();
          }
          if (/특성\s*1/i.test(cleanH)) {
            cleanH = '주 공법/이론 (해당 토픽)';
          } else if (/특성\s*2/i.test(cleanH)) {
            cleanH = '대조 관련 공법/이론';
          }
          return cleanH;
        });
      }
      if (q.tableData && Array.isArray(q.tableData.rows)) {
        q.tableData.rows = q.tableData.rows.map((row) => {
          if (!Array.isArray(row)) return row;
          return row.map((cell, cIdx) => {
            if (cIdx === 0 || typeof cell !== 'string') return cell;
            if (/^[A-Z]\s*입력$/i.test(cell.trim()) || cell.trim() === 'A 입력' || cell.trim() === 'B 입력') {
              return `[INPUT_${cIdx}]`;
            }
            return cell;
          });
        });
      }
    }

    // For table subjective fill-in questions, empty out all cell contents 
    // (except headers and row-label column) and turn them into inputs!
    if ((q.type === '주관식 (표채우기)' || q.subtype === '표채우기' || hasInputPlaceholder) && q.tableData && q.tableData.rows) {
      if (!q.subtype || q.subtype !== '표채우기') {
        q.subtype = '표채우기';
      }
      const oldAnswers = q.answers || q.answer || {};
      const newAnswers = {};
      let inputCount = 1;

      const isCellPlaceholder = (cell) => {
        if (typeof cell !== 'string') return false;
        const trimmed = cell.trim();
        return (
          trimmed.includes('[INPUT_') ||
          trimmed.includes('입력') ||
          /빈칸\s*\(?\d+\)?/i.test(trimmed) ||
          /^\s*[\[\(]?\s*[A-Za-z]\s*[\]\)]?\s*$/i.test(trimmed) ||
          /[A-Za-z]\s*입력/i.test(trimmed)
        );
      };

      // Determine if this is a comparison table (3+ columns) vs calculation table (2 columns)
      const isComparisonTable = Array.isArray(q.tableData.headers) && q.tableData.headers.length >= 3;

      // Count total placeholders in comparison table
      let placeholderCount = 0;
      q.tableData.rows.forEach((row) => {
        if (Array.isArray(row)) {
          row.forEach((cell, cIdx) => {
            if (cIdx > 0 && isCellPlaceholder(cell)) placeholderCount++;
          });
        }
      });
      const isExcessPlaceholders = isComparisonTable && placeholderCount > 4;

      const newRows = q.tableData.rows.map((row, rIdx) => {
        if (!Array.isArray(row)) return [];
        const colCount = row.length;
        const targetCIdx = (rIdx % Math.max(1, colCount - 1)) + 1;

        return row.map((cell, cIdx) => {
          if (cIdx === 0) return cell; // Keep the row label intact

          // [절대 지침 준수]: 표 채우기(Table Quiz)의 모든 내부 셀(cIdx > 0)은 100% 빈칸 입력을 위한 [INPUT_N]으로 전환되어야 함
          const shouldBeInput = true;

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
            
            // Suffix-based recovery (e.g., match INPUT_2_1 for matchedNum = 1)
            if (foundVal === undefined) {
              const matchedKey = Object.keys(oldAnswers).find(key => {
                const parts = key.split('_');
                const lastPart = parts[parts.length - 1];
                return parts[0].toLowerCase() === 'input' && parseInt(lastPart, 10) === matchedNum;
              });
              if (matchedKey) {
                foundVal = oldAnswers[matchedKey];
              }
            }
          }

          // 3. Sequential fallback based on currentCount
          if (foundVal === undefined) {
            const seqLetter = String.fromCharCode(64 + currentCount); // A, B, C...
            foundVal = lookup(`INPUT_${currentCount}`) ?? lookup(`input_${currentCount}`) ?? lookup(currentCount) ?? lookup(String(currentCount)) ?? lookup(seqLetter) ?? lookup(seqLetter.toLowerCase());
            
            // Suffix-based recovery for sequential fallback (e.g., match INPUT_2_1 for currentCount = 1)
            if (foundVal === undefined) {
              const matchedKey = Object.keys(oldAnswers).find(key => {
                const parts = key.split('_');
                const lastPart = parts[parts.length - 1];
                return parts[0].toLowerCase() === 'input' && parseInt(lastPart, 10) === currentCount;
              });
              if (matchedKey) {
                foundVal = oldAnswers[matchedKey];
              }
            }
          }

          // 4. Advanced multidimensional suffix-based recovery (e.g. INPUT_2_1, INPUT_3_1) using rIdx and cIdx
          if (foundVal === undefined) {
            const candidateKeys = Object.keys(oldAnswers).filter(key => {
              const parts = key.split('_');
              if (parts.length < 3) return false;
              if (parts[0].toLowerCase() !== 'input') return false;
              const colNum = parseInt(parts[parts.length - 1], 10);
              return colNum === cIdx;
            });

            if (candidateKeys.length > 0) {
              candidateKeys.sort((a, b) => {
                const aParts = a.split('_');
                const bParts = b.split('_');
                const aRow = parseInt(aParts[1], 10);
                const bRow = parseInt(bParts[1], 10);
                return aRow - bRow;
              });

              if (candidateKeys[rIdx]) {
                foundVal = oldAnswers[candidateKeys[rIdx]];
              }
            }
          }

          if (foundVal !== undefined) {
            correctAnswer = foundVal;
          } else {
            // If no placeholder value was found in oldAnswers, keep the cell text if it's not a placeholder
            const isPlaceholder = isCellPlaceholder(trimmedCell);
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

          if (!shouldBeInput) {
            return (correctAnswer && !isCellPlaceholder(correctAnswer)) ? correctAnswer : cell;
          }
          newAnswers[inputId] = correctAnswer;
          return `[${inputId}]`;
        });
      });

      q.tableData.rows = newRows;
      // 비교표(comparisonTableData)의 answers는 메인 tableData rows 순회에서 처리되지 않으므로
      // oldAnswers에서 comparisonTableData.rows에 실제로 존재하는 키만 살려서 병합한다.
      if (q.comparisonTableData && q.comparisonTableData.rows) {
        const activeComparisonKeys = new Set();
        q.comparisonTableData.rows.forEach(row => {
          if (Array.isArray(row)) {
            row.forEach(cell => {
              if (typeof cell === 'string' && cell.includes('[INPUT_')) {
                const cleanId = cell.replace('[', '').replace(']', '').trim();
                activeComparisonKeys.add(cleanId);
                activeComparisonKeys.add(cleanId.toLowerCase());
                activeComparisonKeys.add(cleanId.toUpperCase());
              }
            });
          }
        });
        Object.keys(oldAnswers).forEach(key => {
          if ((activeComparisonKeys.has(key) || activeComparisonKeys.has(key.toLowerCase()) || activeComparisonKeys.has(key.toUpperCase())) && !(key in newAnswers)) {
            newAnswers[key] = oldAnswers[key];
          }
        });
      }
      q.answers = newAnswers;

      // Forced replacement of question text with (A), (B), (C) list completely deleted
    }
    
    // [Self-Healing] comparisonTableData의 answers 누락 복구
    if (q.comparisonTableData && q.comparisonTableData.rows && q.answers) {
      const answers = q.answers;
      q.comparisonTableData.rows.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cIdx === 0) return; // 첫 번째 열은 구분이므로 건너뜀
          
          if (typeof cell === 'string' && cell.includes('[INPUT_')) {
            const inputId = cell.replace('[', '').replace(']', '').trim();
            
            if (answers[inputId] === undefined || answers[inputId] === null || answers[inputId] === '') {
              const textToParse = q.explanation || '';
              
              // 1. 만약 HTML 테이블 형태라면?
              if (textToParse.includes('<table') || textToParse.includes('<tr>')) {
                const trs = textToParse.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
                const dataTrs = trs.filter(tr => !tr.includes('<th') && tr.includes('<td'));
                if (dataTrs[rIdx]) {
                  const tds = dataTrs[rIdx].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
                  if (tds[cIdx]) {
                    const cleanAns = tds[cIdx].replace(/<[^>]+>/g, '').trim();
                    if (cleanAns && !cleanAns.includes('[INPUT_')) {
                      answers[inputId] = cleanAns;
                      console.log(`[HealComparison] Recovered ${inputId} from HTML explanation: "${cleanAns}"`);
                    }
                  }
                }
              }
              // 2. 만약 HTML이 아니라 순수 마크다운 테이블 형태라면?
              if (!answers[inputId]) {
                const lines = textToParse.split('\n');
                const tableLines = lines.filter(line => line.trim().startsWith('|') && line.trim().endsWith('|'));
                const dataLines = tableLines.filter(line => !/^[|\s:-]+$/.test(line) && !line.includes('구분') && !line.includes('장단점') && !line.includes('비교표'));
                if (dataLines[rIdx]) {
                  const cols = dataLines[rIdx].split('|').map(col => col.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                  if (cols[cIdx]) {
                    const cleanAns = cols[cIdx].replace(/\*\*/g, '').trim();
                    if (cleanAns && !cleanAns.includes('[INPUT_')) {
                      answers[inputId] = cleanAns;
                      console.log(`[HealComparison] Recovered ${inputId} from Markdown explanation: "${cleanAns}"`);
                    }
                  }
                }
              }
            }
          }
        });
      });
    }

    // Legacy geotechnical domain patch has been removed.
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
21. 🚨 [출처 및 원보고서 실측 내용 상세 작성 철칙]: 답변 중 참고자료나 출처(KDS/KCS, 원보고서, Wikipedia 등)를 언급할 때는 겉핥기식 제목만 딸랑 출력하는 행위를 엄격히 금지합니다. 반드시 각 출처 항목 바로 아래에 들여쓰기(- 또는 *)로 해당 출처/보고서에서 실제 확인한 구체적인 공학적 수치($S_{ult}$, $\beta$, $U\%$), 핵심 제어 기준(예: $1\\text{mm/day}$ 등), 원보고서 실측 데이터 및 수리/구조 역학 공식 내용을 최소 2줄 이상 구체적으로 포함하여 작성하십시오.
`;
export function isCalculationQuestion(q, topicCategory = null) {
  if (!q) return false;

  // 1. Explicit Category Flags (Top Priority)
  const resolvedCategory = q.category || topicCategory;
  if (resolvedCategory === '계산') return true;
  if (resolvedCategory === '일반' || resolvedCategory === '이론' || resolvedCategory === '서술') return false;

  if (q.type === '주관식 (계산)' || q.subtype === '계산') return true;
  if (q.type === '주관식 (일반)' || q.type === '주관식 (서술)' || q.subtype === '일반' || q.subtype === '서술' || q.subtype === '이론') return false;

  // 2. Structural checks (Fallback if no category provided)
  const hasCalcHeaders = q.tableData && Array.isArray(q.tableData.headers) && (
    q.tableData.headers[0] === '구하는 항목' || q.tableData.headers[1] === '계산 결과 및 답안'
  );
  if (hasCalcHeaders) return true;

  if (q.calcItems && Array.isArray(q.calcItems) && q.calcItems.length > 0) return true;

  const qText = q.question || '';
  const isFlowchart = qText.includes('┌') || qText.includes('▼') || qText.includes('흐름도') || qText.includes('플로우차트');
  if (isFlowchart) return false;

  return false;
}

