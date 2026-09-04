// 1. 수식($), 일반 텍스트, 그리고 보호된 표 블록 분리 (인라인 줄바꿈 오염 방지)
export function tokenizeForHealing(text) {
  if (!text) return [];
  const tokens = [];
  let lastIndex = 0;
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

export function htmlTableToMarkdown(html, poissonSymbol = null) {
  if (!html) return html;

  let cleanHtml = html
    .replace(/<\s*table[^>]*>/gi, '<table>')
    .replace(/<\s*\/+\s*table[^>]*>/gi, '</table>')
    .replace(/<\s*tr[^>]*>/gi, '<tr>')
    .replace(/<\s*\/+\s*tr[^>]*>/gi, '</tr>')
    .replace(/<\s*th[^>]*>/gi, '<th>')
    .replace(/<\s*\/+\s*th[^>]*>/gi, '</th>')
    .replace(/<\s*td[^>]*>/gi, '<td>')
    .replace(/<\s*\/+\s*td[^>]*>/gi, '</td>');

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
        cells.push(cellMatch[1].trim().replace(/\|/g, '\\vert '));
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
  const lines = questionText.split('\n');
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line.includes('|')) {
      const nextLine = lines[i + 1].trim();
      const isSeparator = nextLine.includes('-') && nextLine.includes('|') && /^[\s|:\-]+$/.test(nextLine);
      if (isSeparator) {
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
  const lines = tableText.split(/\r?\n/);
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

function replaceRoots(str) {
  let processed = str;

  const checkInsideMath = (text, offset) => {
    const before = text.substring(0, offset);
    const blockMatches = (before.match(/\$\$/g) || []).length;
    const isInsideBlock = blockMatches % 2 === 1;
    
    const stripped = before.replace(/\$\$/g, '');
    const isInsideInline = (stripped.match(/\$/g) || []).length % 2 === 1;
    
    return isInsideBlock || isInsideInline;
  };

  processed = processed.replace(/(?<![0-9a-zA-Z\$\\])√([0-9a-zA-Z_]+)(?!\()/g, (match, p1, offset, fullStr) => {
    const isInside = checkInsideMath(fullStr, offset);
    return isInside ? `\\sqrt{${p1}}` : `$\\sqrt{${p1}}$`;
  });

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
      const isAlreadyInMath = checkInsideMath(processed, index);
      
      const replacement = isAlreadyInMath 
        ? (rootNum ? `\\sqrt[${rootNum}]{${content}}` : `\\sqrt{${content}}`)
        : (rootNum ? `$\\sqrt[${rootNum}]{${content}}$` : `$\\sqrt{${content}}$`);
        
      processed = processed.substring(0, index) + replacement + processed.substring(scanIdx);
    } else {
      break;
    }
  }
  return processed;
}
// 3. 메인 레이아웃 및 수식 복구 마스터 함수
export function healLatexFormulas(text, isNested = false, passedPoissonSymbol = null) {
  if (!text || typeof text !== 'string') return text;

  let processed = text.replace(/₩/g, '\\');
  
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (m, p1) => '$$' + p1.replace(/\|/g, '\\vert ') + '$$');
  processed = processed.replace(/\$([^\$\n]+)\$/g, (m, p1) => '$' + p1.replace(/\|/g, '\\vert ') + '$');
  
  processed = processed.replace(/\\\([\s\S]*?\\\)/g, (m, p1) => '$' + p1.trim() + '$');
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (m, p1) => '$$' + p1.trim() + '$$');
  processed = processed.replace(/[–—−]/g, '-');

  processed = processed.replace(/\\pu\s*\{([^}]+)\}/gi, (match, p1) => {
    return ` ${p1.trim()} `;
  });

  processed = replaceRoots(processed);

  if (!isNested) {
    processed = wrapMarkdownTables(processed);
    processed = htmlTableToMarkdown(processed, null);
  }



  const sections = processed.split(/(<!--START_TABLE-->[\s\S]*?<!--END_TABLE-->)/g);
  processed = sections.map(section => {
    if (section.startsWith('<!--START_TABLE-->')) {
      return healMarkdownTable(section, null);
    }
    return section;
  }).join('');

  processed = processed.replace(/<br\s*\/?>/gi, '\n')
                       .replace(/<div[^>]*>\s*[•*]?\s*([^<]+?)\s*<\/div>/gi, '\n* $1')
                       .replace(/<\/?(?:div|p|span|li|ul|ol)\b[^>]*>/gi, '');

  const finalTokens = tokenizeForHealing(processed);
  let result = '';

  for (let i = 0; i < finalTokens.length; i++) {
    result += finalTokens[i].content;
  }

  result = result.trim();
  result = result.replace(/\$?\[\s*INPUT_(\d+(?:_\d+)?)\s*\]\$?/gi, '[INPUT_$1]');

  if (!isNested) {
    result = result.replace(/(?:<!--|\\lt !--|&lt;!--)\s*(?:-\s*)*\s*(?:START|END)_TABLE\s*(?:-\s*)*\s*(?:-->|--\\gt|>|\\gt|--&gt;)\n?/gi, '');
  }

  return result;
}

export function cleanQuizQuestion(q) {
  if (!q) return q;
  let cleanText = typeof q === 'string' ? q : String(q || '');

  // Removed destructive A, B, C regex logic that corrupts valid text
  // Removed list garbage regex that corrupts valid text
  return cleanText.trim();
}

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
    if (q.diagram_svg && typeof q.diagram_svg === 'string') {
      let svgStr = q.diagram_svg.trim();
      svgStr = svgStr.replace(/^```[a-z]*\s*/im, '').replace(/```\s*$/im, '').trim();
      
      if (!svgStr.toLowerCase().includes('<svg')) {
        svgStr = `<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">\n${svgStr}\n</svg>`;
      }
      
      q.diagram_svg = svgStr;
    }
    if (q.question && typeof q.question === 'string') {
      q.question = cleanQuizQuestion(q.question);
    }
    if (typeof q.correctIndex === 'number' && Array.isArray(q.options) && q.correctIndex >= 0 && q.correctIndex < q.options.length) {
      if (!q.answer || !q.options.includes(q.answer)) {
        q.answer = q.options[q.correctIndex];
      }
    }

    if ((q.mixedType === 'overview' || String(q.question || '').includes('[개요 복습]')) && q.tableData) {
      const mainHeaders = (q.tableData.headers || []).join(',');
      const compHeaders = (q.comparisonTableData?.headers || []).join(',');
      const isDuplicated = q.comparisonTableData && mainHeaders === compHeaders && mainHeaders !== '구분,내용';

      if (isDuplicated) {
        const parsed = localParseOverviewContent(q.explanation || q.content || '');
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

    if (q.options && Array.isArray(q.options) && q.answer) {
      let matchedIndex = -1;
      const cleanAns = String(q.answer).trim().toLowerCase();
      if (['1번', '①', '보기1', '보기 1'].includes(cleanAns)) {
        matchedIndex = 0;
      } else if (['2번', '②', '보기2', '보기 2'].includes(cleanAns)) {
        matchedIndex = 1;
      } else if (['3번', '③', '보기3', '보기 3'].includes(cleanAns)) {
        matchedIndex = 2;
      } else if (['4번', '④', '보기4', '보기 4'].includes(cleanAns)) {
        matchedIndex = 3;
      }
      
      if (matchedIndex !== -1 && q.options.length > matchedIndex) {
        const exactMatchIndex = q.options.indexOf(q.answer);
        if (exactMatchIndex === -1) {
          q.answer = q.options[matchedIndex];
        }
      }

      const optNums = q.options.map(o => {
        const stripped = String(o || '').replace(/^(?:[①-⑳]|\(?\d+\)?[\.\s]*)/, '').replace(/[^0-9.-]/g, '');
        return parseFloat(stripped);
      }).filter(n => !isNaN(n));
      const ansNum = parseFloat(String(q.answer || '').replace(/^(?:[①-⑳]|\(?\d+\)?[\.\s]*)/, '').replace(/[^0-9.-]/g, ''));
      if (optNums.length === q.options.length && !isNaN(ansNum) && ansNum > 0 && ansNum < 1) {
        const is100x = optNums.some(n => Math.abs(n - ansNum * 100) < 1e-5);
        const is10x = optNums.some(n => Math.abs(n - ansNum * 10) < 1e-5);
        const allLargeOrZero = optNums.every(n => n === 0 || n >= 1);
        
        if ((is100x || is10x) && allLargeOrZero) {
          const factor = is100x ? 100 : 10;
          q.options = q.options.map(opt => {
            const stripped = String(opt || '').replace(/^(?:[①-⑳]|\(?\d+\)?[\.\s]*)/, '').replace(/[^0-9.-]/g, '');
            const num = parseFloat(stripped);
            if (isNaN(num)) return opt;
            return (num / factor).toFixed(2);
          });
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
          
          return 0;
        };

        for (const opt of q.options) {
          const score = getOptionMatchScore(opt, q.answer);
          if (score > maxScore) {
            maxScore = score;
            bestOpt = opt;
          }
        }

        if (bestOpt && maxScore >= 700) {
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

    const qText = q.question || '';
    const isExplicitCompOrTheory = /비교하시오|특성을\s*비교|차이점|서술하시오|설명하시오/i.test(qText);
    const hasCalcHeaders = q.tableData && Array.isArray(q.tableData.headers) && (
      q.tableData.headers[0] === '구하는 항목' || q.tableData.headers[1] === '계산 결과 및 답안'
    );

    const hasMultipleSubItems = /(?:\(1\)|①).*?(?:\(2\)|②)/.test(qText);
    const hasCalcKeyword = /구하시오|산정하시오|계산하시오|결정하시오/i.test(qText);

    const isCalcQ = (q.category === '계산') && !isExplicitCompOrTheory && (
      q.type === '주관식 (계산)' || 
      q.subtype === '계산' || 
      hasCalcHeaders || 
      (/Terzaghi|기초|지지력|허용하중|침투유량|침투수량|간극수압|동수경사|안전율/i.test(qText) && /산정|계산|구하시오/i.test(qText)) || 
      (hasMultipleSubItems && hasCalcKeyword)
    );

    if (isCalcQ) {
      q.type = '주관식 (계산)';
      q.subtype = '계산';

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

      const isGeneric = !q.calcItems || q.calcItems.length === 0 || (
        Array.isArray(q.calcItems) && q.calcItems.some(it => /(?:핵심|수치)\s*(?:계산|산출)\s*(?:요구\s*)?항목/i.test(it.label || ''))
      ) || (
        Array.isArray(q.calcItems) && q.calcItems.some(it => /^[\(\[]?\d+[\)\]]?\s*수치\s*(?:계산|산출)/i.test(it.label || ''))
      ) || (
        Array.isArray(q.calcItems) && q.calcItems.some(it => /빈칸에\s*알맞/i.test(it.label || ''))
      );

      if (isGeneric) {
        const itemMatches = [...qText.matchAll(/(?:\((\d+)\)|(\d+)\)|①|②|③|④|⑤|⑥)\s*([\s\S]+?(?=(?:\(\d+\)|[2-9]\)|①|②|③|④|⑤|⑥|\n|$)))/g)];
        if (itemMatches.length >= 2) {
          q.calcItems = itemMatches.map((m, i) => ({
            id: `INPUT_${i + 1}`,
            label: `(${i + 1}) ${(m[3] || m[0]).replace(/^[\(\[\d\s\)\]①-⑥]+/, '').replace(/[,.\s]+$/, '').trim()}`
          }));
        } else {
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

          const parenMatch = cleanH.match(/^((?:조건|Case|경우)\s*[\(\[]?[A-Za-z0-9가-힣]+[\)\]]?)/i);
          if (parenMatch) {
            cleanH = parenMatch[1].trim();
          }

          if (/보고서\s*특성\s*1|특성\s*1/i.test(cleanH)) {
            cleanH = '주 공법/이론 (해당 토픽)';
          } else if (/보고서\s*특성\s*2|특성\s*2/i.test(cleanH)) {
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
            if (/^[A-Z]\s*입력$/i.test(cell.trim()) || cell.trim() === 'A 입력' || cell.trim() === 'B 입력' || cell.trim() === 'C 입력') {
              return `[INPUT_${cIdx}]`;
            }
            return cell;
          });
        });
      }
    }

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

      const newRows = q.tableData.rows.map((row, rIdx) => {
        if (!Array.isArray(row)) return [];

        return row.map((cell, cIdx) => {
          if (cIdx === 0) return cell;

          const inputId = `INPUT_${inputCount}`;
          const currentCount = inputCount;
          inputCount++;

          let correctAnswer = '';
          const trimmedCell = typeof cell === 'string' ? cell.trim() : '';
          
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
            placeholderId = letterMatch[1].toUpperCase();
            matchedNum = letterMatch[1].toUpperCase().charCodeAt(0) - 64;
          } else if (binkanMatch) {
            placeholderId = `INPUT_${binkanMatch[1]}`;
            matchedNum = parseInt(binkanMatch[1], 10);
          }

          const lookup = (key) => {
            if (key === undefined || key === null) return undefined;
            return oldAnswers[key];
          };

          let foundVal = lookup(placeholderId) ?? lookup(placeholderId?.toLowerCase()) ?? lookup(placeholderId?.toUpperCase());

          if (foundVal === undefined && matchedNum !== null) {
            const letterKey = String.fromCharCode(64 + matchedNum);
            foundVal = lookup(letterKey) ?? lookup(letterKey.toLowerCase()) ?? lookup(`INPUT_${matchedNum}`) ?? lookup(`input_${matchedNum}`) ?? lookup(matchedNum) ?? lookup(String(matchedNum));
            
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

          if (foundVal === undefined) {
            const seqLetter = String.fromCharCode(64 + currentCount);
            foundVal = lookup(`INPUT_${currentCount}`) ?? lookup(`input_${currentCount}`) ?? lookup(currentCount) ?? lookup(String(currentCount)) ?? lookup(seqLetter) ?? lookup(seqLetter.toLowerCase());
            
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
            correctAnswer = cell;
          }

          const isPlaceholder = isCellPlaceholder(trimmedCell);
          const shouldBeInput = isPlaceholder;

          if (!shouldBeInput) {
            return (correctAnswer && !isCellPlaceholder(correctAnswer)) ? correctAnswer : cell;
          }
          newAnswers[inputId] = correctAnswer;
          return `[${inputId}]`;
        });
      });

      q.tableData.rows = newRows;
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
    }
    
    if (q.comparisonTableData && q.comparisonTableData.rows && q.answers) {
      const answers = q.answers;
      q.comparisonTableData.rows.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cIdx === 0) return;
          
          if (typeof cell === 'string' && cell.includes('[INPUT_')) {
            const inputId = cell.replace('[', '').replace(']', '').trim();
            
            if (answers[inputId] === undefined || answers[inputId] === null || answers[inputId] === '') {
              const textToParse = q.explanation || '';
              
              if (textToParse.includes('<table') || textToParse.includes('<tr>')) {
                const trs = textToParse.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
                const dataTrs = trs.filter(tr => !tr.includes('<th') && tr.includes('<td'));
                if (dataTrs[rIdx]) {
                  const tds = dataTrs[rIdx].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
                  if (tds[cIdx]) {
                    const cleanAns = tds[cIdx].replace(/<[^>]+>/g, '').trim();
                    if (cleanAns && !cleanAns.includes('[INPUT_')) {
                      answers[inputId] = cleanAns;
                    }
                  }
                }
              }
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
                    }
                  }
                }
              }
            }
          }
        });
      });
    }
  }
  return healDeep(q);
}

export function healTheoryQuestionObject(t) { return healDeep(t); }
export function healFormulaQuestionObject(f) { return healDeep(f); }
export function healAnswersheetQuestionObject(a) { return healQuizQuestionObject(a); }

export const LATEX_PROMPT_INSTRUCTIONS = `
[LaTeX 수식 및 마크다운 작성 지침]:
1. 모든 수식, 변수 기호(예: $t$, $\\Delta t$, $\\sigma$, $\\gamma_w$, $S_t$, $\\alpha$, $\\beta$ 등)는 반드시 $ 또는 $$ 기호로 감싸서 출력하십시오. 날것의 텍스트 표기나 백틱(\`) 표기는 금지합니다.
2. 역슬래시(\\) 대신 샵(#) 등 임의의 기호를 사용하지 말고, 정규 LaTeX 명령어(\\sigma, \\frac 등)를 사용하십시오.
3. 인라인 수식($...$) 작성 시 기호 안쪽에 공백이나 줄바꿈을 넣지 마십시오. ($수식$ (O) / $ 수식 $ (X))
5. 수식 내부에서 부등호는 마크다운 파싱 오류를 방지하기 위해 반드시 \\lt, \\gt 로 표기하십시오.
6. 달러 기호 자체를 이스케이프(\\$ 또는 \\\\$)하지 마십시오.
8. 변수와 아래첨자(예: $N_c$, $D_f$, $k_h$)는 중간에 달러 기호를 쪼개지 말고 하나의 수식 블록으로 감싸십시오.
10. <div>, <span> 등의 HTML 태그 사용을 금지하며 강조는 마크다운(**강조**)을 사용하십시오.
11. 내용이 없는 빈 소제목은 출력하지 마십시오.

[수학적 정합성 규칙]:
- 객관식 문제의 정답(answer)은 해설(explanation)의 계산 결과와 반드시 완벽히 일치해야 합니다.
- 분모에 위치한 변수($1/\\beta \\propto B^{-1/4}$)의 증가/감소 관계 등 반비례 논리 모순이 발생하지 않도록 주의하십시오.
`;

export const LATEX_CHAT_PROMPT_INSTRUCTIONS = `
[LaTeX 수식 및 대화 포맷 지침]:
1. JSON 형식으로 감싸지 말고, 일반 대화 문장 및 마크다운 포맷으로 답변하십시오.
2. 모든 수식 및 변수 기호($K_s$, $k_h$, $e$, $c$, $\\phi$, $\\sigma$, $\\tau$ 등)는 단독/인라인 여부와 무관하게 반드시 $ 또는 $$ 로 감싸십시오.
3. 인라인 수식($...$) 안쪽의 시작/끝 공백 및 줄바꿈을 금지합니다.
5. 수식 내 부등호는 \\lt, \\gt 를 사용하십시오.
7. 데이터 정리가 필요한 경우 HTML이나 tabular 대신 마크다운 표(| 열 | 구분선 |)를 사용하십시오.
8. 설명 리스트 전체를 하나의 거대한 수식 블록($$...$$)으로 감싸지 말고 개별 수식마다 분리하여 적용하십시오.
9. 출처나 보고서를 인용할 때는 단순 제목 외에 구체적인 공학적 수치, 기준, 계산 공식을 포함하여 정량적으로 작성하십시오.
10. 아스키 아트 형태의 세로 그래프 출력을 금지하며, 마크다운 표나 텍스트 수치 요약으로 대체하십시오.
`;

export function escapeJsonBackslashes(str) {
  if (!str) return str;
  let result = '';
  let inString = false;
  let i = 0;
  
  const latexCommands = [
    'newline', 'nabla', 'nu', 'neq', 'neg', 'ni', 'notin', 'ngeq', 'nleq', 'nsim', 'ncong', 'nparallel', 'noindent', 'not',
    'theta', 'tau', 'tan', 'times', 'tilde', 'text', 'tfrac', 'triangle', 'top', 'to', 'tiny', 'today', 'tag',
    'rho', 'right', 'rule', 'rangle', 'rightarrow', 'rightleftharpoons', 'rightharpoonup', 'rightharpoondown', 'real', 'ref', 'raise',
    'beta', 'bar', 'begin', 'bmod', 'boldsymbol', 'bullet', 'box', 'bigcap', 'bigcup', 'backslash', 'bf',
    'frac', 'forall', 'flat', 'frown', 'footnotesize', 'fbox',
    'phi', 'varphi', 'mathrm'
  ];

  while (i < str.length) {
    const char = str[i];
    let isEscaped = false;
    let slashCount = 0;
    let backtrack = i - 1;
    while (backtrack >= 0 && str[backtrack] === '\\') {
      slashCount++;
      backtrack--;
    }
    isEscaped = slashCount % 2 !== 0;

    if (char === '"' && !isEscaped) {
      inString = !inString;
      result += char;
      i++;
    } else if (inString && char === '\\') {
      const next = str[i + 1];
      
      if (next === '"' || next === '/' || next === '\\') {
        result += char + next;
        i += 2;
      } else if (['n', 't', 'r', 'b', 'f'].includes(next)) {
        let tempIndex = i + 1;
        let commandWord = '';
        while (tempIndex < str.length && /[a-zA-Z]/.test(str[tempIndex])) {
          commandWord += str[tempIndex];
          tempIndex++;
        }
        
        const isLatex = latexCommands.includes(commandWord);
        if (isLatex) {
          result += '\\\\';
          i++;
        } else {
          result += char + next;
          i += 2;
        }
      } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(str.substring(i + 2, i + 6))) {
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
  
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  }

  const escaped = escapeJsonBackslashes(cleaned);
  try {
    return JSON.parse(escaped);
  } catch (err) {
    console.error("JSON parse error! Raw length:", text.length, "Escaped length:", escaped.length);
    console.error("Failed string content:\n", escaped);
    throw err;
  }
}

export function isCalculationQuestion(q) {
  if (!q) return false;

  const qText = q.question || '';
  const isExplicitCompOrTheory = /비교하시오|특성을\s*비교|차이점|서술하시오|설명하시오/i.test(qText);
  if (isExplicitCompOrTheory) return false;

  if (q.type === '주관식 (계산)' || q.subtype === '계산') return true;
  if (q.calcItems && Array.isArray(q.calcItems) && q.calcItems.length > 0) return true;

  const hasCalcHeaders = q.tableData && Array.isArray(q.tableData.headers) && (
    q.tableData.headers[0] === '구하는 항목' || q.tableData.headers[1] === '계산 결과 및 답안'
  );
  if (hasCalcHeaders) return true;

  const hasCalcKeyword = /산정하시오|계산하시오|구하시오/i.test(qText);
  if (q.category === '계산' && hasCalcKeyword) return true;

  return false;
}

export async function validateAndHealQuestion(question) {
  if (!question) return question;
  return healQuizQuestionObject(question);
}
