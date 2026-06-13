function convertHtmlTablesToMarkdown(html) {
  if (!html) return '';
  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  
  return html.replace(tableRegex, (match, tableContent) => {
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    const mdRows = [];
    let maxCols = 0;
    
    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const rowContent = trMatch[1];
      const cellRegex = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
      let cellMatch;
      const cells = [];
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        let cellText = cellMatch[2]
          .replace(/<[^>]+>/g, '')
          .replace(/\|/g, '\\|')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(cellText);
      }
      if (cells.length > 0) {
        mdRows.push(cells);
        if (cells.length > maxCols) {
          maxCols = cells.length;
        }
      }
    }
    
    if (mdRows.length === 0) return '';
    
    let mdTable = '\n\n';
    const firstRow = mdRows[0];
    mdTable += '| ' + firstRow.join(' | ') + ' |\n';
    
    const separators = Array(maxCols).fill('---');
    mdTable += '| ' + separators.join(' | ') + ' |\n';
    
    for (let i = 1; i < mdRows.length; i++) {
      const row = mdRows[i];
      while (row.length < maxCols) row.push('');
      mdTable += '| ' + row.join(' | ') + ' |\n';
    }
    
    mdTable += '\n';
    return mdTable;
  });
}

function mergeVerticalText(text) {
  if (!text) return '';
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const mergedLines = [];
  let currentSingleCharGroup = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSingleChar = line.length === 1 || 
                         (line.length === 2 && (line.startsWith('(') || line.endsWith(')') || line.startsWith('[') || line.endsWith(']')));
    
    if (isSingleChar) {
      currentSingleCharGroup.push(line);
    } else {
      if (currentSingleCharGroup.length > 0) {
        if (currentSingleCharGroup.length > 1) {
          mergedLines.push(currentSingleCharGroup.join(''));
        } else {
          mergedLines.push(currentSingleCharGroup[0]);
        }
        currentSingleCharGroup = [];
      }
      mergedLines.push(line);
    }
  }
  if (currentSingleCharGroup.length > 0) {
    if (currentSingleCharGroup.length > 1) {
      mergedLines.push(currentSingleCharGroup.join(''));
    } else {
      mergedLines.push(currentSingleCharGroup[0]);
    }
  }
  return mergedLines.join('\n');
}

// Helper: Extract clean plain text from HTML with table preservation
function htmlToPlainText(html) {
  if (!html) return '';
  // 1. Remove script and style tags and their contents safely (avoiding catastrophic backtracking)
  let text = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  
  // [추가 대책] 인라인 스타일 속성(style="...")을 최우선 박멸하여 태그 파싱 오류 및 찌꺼기 차단
  text = text.replace(/style\s*=\s*(?:"[^"]*"|'[^']*'|夸[^夸]*夸)/gi, '');
  
  // 2. Convert tables to Markdown before stripping block tags
  text = convertHtmlTablesToMarkdown(text);
  
  // 3. Replace common block elements with newlines/spaces to maintain layout structure
  text = text.replace(/<\/p>|<\/div>|<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/td>|<\/th>/gi, '   ');

  // 4. Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 5. Unescape common HTML entities
  const entities = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
  };
  text = text.replace(/&[a-z0-9#]+;/gi, (match) => {
    return entities[match.toLowerCase()] || match;
  });

  // 6. Collapse excessive empty lines but preserve Markdown table formatting
  const lines = text.split('\n');
  const processedLines = [];
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine.startsWith('|')) {
      if (!inTable) {
        processedLines.push('');
        inTable = true;
      }
      processedLines.push(trimmedLine);
    } else {
      if (inTable) {
        processedLines.push('');
        inTable = false;
      }
      if (trimmedLine.length > 0) {
        processedLines.push(trimmedLine);
      }
    }
  }
  
  let joinedText = '';
  for (let i = 0; i < processedLines.length; i++) {
    const current = processedLines[i];
    if (i === 0) {
      joinedText += current;
      continue;
    }
    const prev = processedLines[i - 1];
    if (current.startsWith('|') && prev.startsWith('|')) {
      joinedText += '\n' + current;
    } else if (current === '' || prev === '') {
      joinedText += '\n' + current;
    } else {
      joinedText += '\n\n' + current;
    }
  }
  
  return mergeVerticalText(joinedText);
}

// Test Cases
const testCase1 = `<div>
  <p style="font-family: 'Malgun Gothic'; font-size: 14px; margin-bottom: >10px;">
    본문 텍스트입니다.
  </p>
  <span style=夸color:red;font-weight:bold夸>강조된 텍스트</span>
</div>`;

const testCase2 = `<div>
  <script>
    if (x > y) {
      console.log('Ignore this');
    }
  </script>
  <p>이것은 포함되어야 하는 본문입니다.</p>
</div>`;

console.log("=== TEST CASE 1 ===");
const out1 = htmlToPlainText(testCase1);
console.log("OUTPUT 1:\n", out1);
console.log("HAS RESIDUE '>'; or '夸':", out1.includes('>') || out1.includes('夸'));

console.log("\n=== TEST CASE 2 ===");
const out2 = htmlToPlainText(testCase2);
console.log("OUTPUT 2:\n", out2);
console.log("HAS SCRIPT CODE:", out2.includes('console.log') || out2.includes('Ignore this'));
