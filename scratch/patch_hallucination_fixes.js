const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../server/index.js');
let content = fs.readFileSync(filePath, 'utf8');

// Normalizing line endings for robust replacement
const newline = content.includes('\r\n') ? '\r\n' : '\n';
const normalizeNewlines = (str) => str.replace(/\r\n/g, '\n');
let normContent = normalizeNewlines(content);

// ─── 1. Fix Gemini Temperature calling ───
const oldGeminiModelCall = `            const model = genAI.getGenerativeModel({
              model: modelName,
              systemInstruction: systemInstruction || undefined
            });`;
const newGeminiModelCall = `            const model = genAI.getGenerativeModel({
              model: modelName,
              systemInstruction: systemInstruction || undefined,
              generationConfig: { temperature: 0.2 }
            });`;

if (normContent.includes(normalizeNewlines(oldGeminiModelCall))) {
  normContent = normContent.replace(normalizeNewlines(oldGeminiModelCall), normalizeNewlines(newGeminiModelCall));
  console.log('1. Patched Gemini temperature call successfully.');
} else {
  console.error('Failed to find Gemini model call target!');
  process.exit(1);
}

// ─── 2. Fix htmlToPlainText with Table Markdown support and add smartTruncate ───
const oldHtmlToPlainText = `// Helper: Extract clean plain text from HTML
function htmlToPlainText(html) {
  if (!html) return '';
  // 1. Remove script and style tags and their contents
  let text = html.replace(/<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi, '');
  text = text.replace(/<style\\b[^<]*(?:(?!<\\/style>)<[^<]*)*<\\/style>/gi, '');
  
  // 2. Replace common block elements with newlines/spaces to maintain layout structure
  text = text.replace(/<\\/p>|<\\/div>|<br\\s*\\/?>/gi, '\\n');
  text = text.replace(/<\\/h[1-6]>/gi, '\\n\\n');
  text = text.replace(/<\\/tr>/gi, '\\n');
  text = text.replace(/<\\/td>|<\\/th>/gi, '   ');

  // 3. Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 4. Unescape common HTML entities
  const entities = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&cent;': '¢',
    '&pound;': '£',
    '&yen;': '¥',
    '&euro;': '€',
    '&copy;': '©',
    '&reg;': '®'
  };
  text = text.replace(/&[a-z0-9#]+;/gi, (match) => {
    return entities[match.toLowerCase()] || match;
  });

  // 5. Collapse excessive empty lines and whitespace but keep paragraphs
  text = text.split('\\n').map(line => line.trim()).filter(line => line.length > 0).join('\\n\\n');
  
  return mergeVerticalText(text);
}`;

const newHtmlToPlainText = `// Helper: Convert HTML tables to Markdown
function convertHtmlTablesToMarkdown(html) {
  if (!html) return '';
  const tableRegex = /<table\\b[^>]*>([\\s\\S]*?)<\\/table>/gi;
  
  return html.replace(tableRegex, (match, tableContent) => {
    const trRegex = /<tr\\b[^>]*>([\\s\\S]*?)<\\/tr>/gi;
    let trMatch;
    const mdRows = [];
    let maxCols = 0;
    
    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const rowContent = trMatch[1];
      const cellRegex = /<(td|th)\\b[^>]*>([\\s\\S]*?)<\\/\\1>/gi;
      let cellMatch;
      const cells = [];
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        let cellText = cellMatch[2]
          .replace(/<[^>]+>/g, '')
          .replace(/\\|/g, '\\\\|')
          .replace(/\\s+/g, ' ')
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
    
    let mdTable = '\\n\\n';
    const firstRow = mdRows[0];
    mdTable += '| ' + firstRow.join(' | ') + ' |\\n';
    
    const separators = Array(maxCols).fill('---');
    mdTable += '| ' + separators.join(' | ') + ' |\\n';
    
    for (let i = 1; i < mdRows.length; i++) {
      const row = mdRows[i];
      while (row.length < maxCols) row.push('');
      mdTable += '| ' + row.join(' | ') + ' |\\n';
    }
    
    mdTable += '\\n';
    return mdTable;
  });
}

// Helper: Extract clean plain text from HTML with table preservation
function htmlToPlainText(html) {
  if (!html) return '';
  // 1. Remove script and style tags and their contents
  let text = html.replace(/<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi, '');
  text = text.replace(/<style\\b[^<]*(?:(?!<\\/style>)<[^<]*)*<\\/style>/gi, '');
  
  // 2. Convert tables to Markdown before stripping block tags
  text = convertHtmlTablesToMarkdown(text);
  
  // 3. Replace common block elements with newlines/spaces to maintain layout structure
  text = text.replace(/<\\/p>|<\\/div>|<br\\s*\\/?>/gi, '\\n');
  text = text.replace(/<\\/h[1-6]>/gi, '\\n\\n');
  text = text.replace(/<\\/tr>/gi, '\\n');
  text = text.replace(/<\\/td>|<\\/th>/gi, '   ');

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
    '&cent;': '¢',
    '&pound;': '£',
    '&yen;': '¥',
    '&euro;': '€',
    '&copy;': '©',
    '&reg;': '®'
  };
  text = text.replace(/&[a-z0-9#]+;/gi, (match) => {
    return entities[match.toLowerCase()] || match;
  });

  // 6. Collapse excessive empty lines but preserve Markdown table formatting
  const lines = text.split('\\n');
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
      joinedText += '\\n' + current;
    } else if (current === '' || prev === '') {
      joinedText += '\\n' + current;
    } else {
      joinedText += '\\n\\n' + current;
    }
  }
  
  return mergeVerticalText(joinedText);
}

// Helper: Smart truncate text at sentence/paragraph boundaries
function smartTruncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  const sub = text.substring(0, maxLength);
  const lastParagraph = sub.lastIndexOf('\\n\\n');
  if (lastParagraph > maxLength * 0.8) {
    return sub.substring(0, lastParagraph).trim() + '\\n\\n... [텍스트가 너무 길어 중략됨]';
  }
  const lastLine = sub.lastIndexOf('\\n');
  if (lastLine > maxLength * 0.8) {
    return sub.substring(0, lastLine).trim() + '\\n... [텍스트가 너무 길어 중략됨]';
  }
  const lastPeriod = Math.max(sub.lastIndexOf('. '), sub.lastIndexOf('.\\n'));
  if (lastPeriod > maxLength * 0.7) {
    return sub.substring(0, lastPeriod + 1).trim() + ' ... [텍스트가 너무 길어 중략됨]';
  }
  return sub.trim() + '... [텍스트가 너무 길어 중략됨]';
}`;

if (normContent.includes(normalizeNewlines(oldHtmlToPlainText))) {
  normContent = normContent.replace(normalizeNewlines(oldHtmlToPlainText), normalizeNewlines(newHtmlToPlainText));
  console.log('2. Patched htmlToPlainText and added smartTruncate successfully.');
} else {
  console.error('Failed to find htmlToPlainText target!');
  process.exit(1);
}

// ─── 3. Replace Hardcoded Truncation calls with smartTruncate ───

// 3.1 AI Questions limit (original lines 2690-2692)
const oldAiQuestionsTrunc = `      if (fileText.length > 10000) {
        fileText = fileText.substring(0, 10000) + '... [텍스트가 너무 길어 중략됨]';
      }`;
const newAiQuestionsTrunc = `      fileText = smartTruncate(fileText, 30000);`;
normContent = normContent.replace(normalizeNewlines(oldAiQuestionsTrunc), normalizeNewlines(newAiQuestionsTrunc));

// 3.2 Question regenerate limits (original lines 3187-3189 and 3649-3651)
const oldRegenTrunc1 = `        if (fileText.length > 8000) {
          fileText = fileText.substring(0, 8000) + '... [중략]';
        }`;
const newRegenTrunc1 = `        fileText = smartTruncate(fileText, 25000);`;
normContent = normContent.replace(normalizeNewlines(oldRegenTrunc1), normalizeNewlines(newRegenTrunc1));

const oldRegenTrunc2 = `        if (fileText.length > 8000) {
          fileText = fileText.substring(0, 8000) + '... [중략]';
        }`;
const newRegenTrunc2 = `        fileText = smartTruncate(fileText, 25000);`;
normContent = normContent.replace(normalizeNewlines(oldRegenTrunc2), normalizeNewlines(newRegenTrunc2));

// 3.3 Exam limits per topic (original lines 4018-4020 and 4395-4397)
const oldExamTrunc1 = `        // Limit per topic to avoid prompt token bloating
        if (fileText.length > 1500) fileText = fileText.substring(0, 1500) + '...[중략]';`;
const newExamTrunc1 = `        // Smart limit per topic to avoid prompt token bloating and text corruption
        fileText = smartTruncate(fileText, 10000);`;
normContent = normContent.replace(normalizeNewlines(oldExamTrunc1), normalizeNewlines(newExamTrunc1));

const oldExamTrunc2 = `        // Limit per topic to avoid prompt token bloating
        if (fileText.length > 1500) fileText = fileText.substring(0, 1500) + '...[중략]';`;
const newExamTrunc2 = `        // Smart limit per topic to avoid prompt token bloating and text corruption
        fileText = smartTruncate(fileText, 10000);`;
normContent = normContent.replace(normalizeNewlines(oldExamTrunc2), normalizeNewlines(newExamTrunc2));

// 3.4 Answer Sheet upload limit (original line 6049)
const oldAnswersheetTrunc = `      fileText = fileText.substring(0, 20000) + '...[중략]';`;
const newAnswersheetTrunc = `      fileText = smartTruncate(fileText, 40000);`;
normContent = normContent.replace(normalizeNewlines(oldAnswersheetTrunc), normalizeNewlines(newAnswersheetTrunc));

console.log('3. Replaced all truncation limits with smartTruncate.');

// ─── 4. Isolation and wrapping for Exam multi-topics ───

// 4.1 Wrap combined topics in XML-like tags (original lines 4021 and 4398)
const oldTopicPush1 = `      topicTexts.push(\`[토픽: \${topic.title}]\\n키워드: \${topic.keywords || '없음'}\\n\${fileText || '소스 없음'}\`);`;
const newTopicPush1 = `      topicTexts.push(\`<Topic id="\${topic.id}" title="\${topic.title}" keywords="\${topic.keywords || '없음'}">\\n\${fileText || '소스 없음'}\\n</Topic>\`);`;
normContent = normContent.replace(normalizeNewlines(oldTopicPush1), normalizeNewlines(newTopicPush1));

const oldTopicPush2 = `      topicTexts.push(\`[토픽: \${topic.title}]\\n키워드: \${topic.keywords || '없음'}\\n\${fileText || '소스 없음'}\`);`;
const newTopicPush2 = `      topicTexts.push(\`<Topic id="\${topic.id}" title="\${topic.title}" keywords="\${topic.keywords || '없음'}">\\n\${fileText || '소스 없음'}\\n</Topic>\`);`;
normContent = normContent.replace(normalizeNewlines(oldTopicPush2), normalizeNewlines(newTopicPush2));

// 4.2 Update exam prompts to strictly isolate topics (original rules 4090-4095 and 4494-4498)
const oldExamRules1 = `🚨 [출제 출처 한정 규칙 - 극도로 중요!]:
1. 반드시 아래 제공된 **[평가 범위 토픽 목록]** 및 **[통합 소스 텍스트]**에 직접 기술되어 있는 구체적인 개념, 공식, 이론 및 지식의 범위 안에서만 시험 문제를 생성하십시오.
2. 제공된 소스 자료 텍스트에 **직접 등장하지 않는 외부의 타 공학/역학 이론이나 일반 상식(예: 지문에 직접 기재되지 않은 동역학, 구조역학, 진동학, 임계감쇠, 단자유도 시스템, 고유진동수, 또는 그 외 외부 임의 주제 등)은 절대로 지문에 주입하거나 날조하여 문제를 만들지 마십시오.**
3. 오직 제공된 소스 본문 텍스트 내에 **단어 및 수식으로 명시되어 있는 범위 내로만 출제 범위를 100% 철저히 한정**하십시오. 소스에 없는 타분야 내용을 엮거나 상상하여 문제를 구성할 경우 심각한 출제 오류로 간주됩니다.
4. 객관식 모든 보기(options) 및 해설 역시 오직 소스 문서 내용의 문장과 지식들을 변형/결합하여 만들어야 하며, 본문과 아예 무관한 엉뚱한 외부 용어나 가상의 기술적 지식을 보기에 혼합하는 것을 절대 금지합니다.`;

const newExamRules1 = `🚨 [출제 출처 한정 및 문맥 격리 규칙 (Topic Isolation) - 극도로 중요!]:
1. 반드시 아래 제공된 **[평가 범위 토픽 목록]** 및 **[통합 소스 텍스트]**의 각 \`<Topic>...</Topic>\` 태그에 직접 기술되어 있는 구체적인 개념, 공식, 이론 및 지식의 범위 안에서만 시험 문제를 생성하십시오.
2. 각 문제를 출제할 때 해당 문제의 출처가 되는 단 하나의 토픽의 범위로 한정하여 문제를 구성하십시오. 절대 특정 토픽에 관한 문제를 낼 때 다른 토픽에 적힌 단어, 수치, 공학적 조건이나 공식들을 혼합(Cross-contamination)하여 보기(options)나 지문을 만드는 '문맥 교차 오염'을 저지르지 마십시오. 각 문제는 소스 상의 독립된 개별 토픽 내용에 완전히 부합해야 합니다.
3. 제공된 소스 자료 텍스트에 **직접 등장하지 않는 외부의 타 공학/역학 이론이나 일반 상식(예: 지문에 직접 기재되지 않은 동역학, 구조역학, 진동학, 임계감쇠, 단자유도 시스템, 고유진동수, 또는 그 외 외부 임의 주제 등)은 절대로 지문에 주입하거나 날조하여 문제를 만들지 마십시오.**
4. 오직 제공된 소스 본문 텍스트 내에 **단어 및 수식으로 명시되어 있는 범위 내로만 출제 범위를 100% 철저히 한정**하십시오. 소스에 없는 타분야 내용을 엮거나 상상하여 문제를 구성할 경우 심각한 출제 오류로 간주됩니다.
5. 객관식 모든 보기(options) 및 해설 역시 오직 소스 문서 내용의 문장과 지식들을 변형/결합하여 만들어야 하며, 본문과 아예 무관한 엉뚱한 외부 용어나 가상의 기술적 지식을 보기에 혼합하는 것을 절대 금지합니다.`;

normContent = normContent.replace(normalizeNewlines(oldExamRules1), normalizeNewlines(newExamRules1));

const oldExamRules2 = `🚨 [출제 출처 한정 규칙 - 극도로 중요!]:
1. 반드시 아래 제공된 **[평가 범위 토픽 목록 및 본문]**, **[저장된 필수공식 목록]**, **[저장된 이론유도 목록]**에서 직접 다루고 있는 구체적인 개념, 공식 및 물리적 기전의 범위 안에서만 시험 문제를 생성하십시오.
2. 제공된 소스 자료 및 저장된 내용에 **직접 등장하지 않는 외부의 엉뚱한 타 공학/역학 분야 이론(예: 소스에 직접 언급되지 않은 동역학, 구조역학, 진동학, 임계감쇠, 단자유도 시스템, 고유진동수, 또는 그 외 외부 임의 주제 등)이나 임의의 다른 지식을 출제 규칙에 주입하여 환각(Hallucination) 문제를 유발하지 마십시오.**
3. 오직 제공된 소스 본문 텍스트 내에 **단어 및 수식으로 명시되어 있는 범위 내로만 출제 범위를 100% 철저히 한정**하십시오. 소스에 없는 타분야 내용을 엮거나 상상하여 문제를 구성할 경우 심각한 출제 오류로 간주됩니다.
4. 객관식 모든 보기(options) 및 해설 역시 오직 소스 문서 내용의 문장과 지식들을 변형/결합하여 만들어야 하며, 본문과 아예 무관한 엉뚱한 외부 용어나 가상의 기술적 지식을 보기에 혼합하는 것을 절대 금지합니다.`;

const newExamRules2 = `🚨 [출제 출처 한정 및 문맥 격리 규칙 (Topic Isolation) - 극도로 중요!]:
1. 반드시 아래 제공된 **[평가 범위 토픽 목록 및 본문]**의 각 \`<Topic>...</Topic>\` 태그, **[저장된 필수공식 목록]**, **[저장된 이론유도 목록]**에서 직접 다루고 있는 구체적인 개념, 공식 및 물리적 기전의 범위 안에서만 시험 문제를 생성하십시오.
2. 각 문제를 출제할 때 해당 문제의 출처가 되는 단 하나의 토픽의 범위로 한정하여 문제를 구성하십시오. 절대 특정 토픽에 관한 문제를 낼 때 다른 토픽에 적힌 단어, 수치, 공학적 조건이나 공식들을 혼합(Cross-contamination)하여 보기(options)나 지문을 만드는 '문맥 교차 오염'을 저지르지 마십시오. 각 문제는 소스 상의 독립된 개별 토픽 내용에 완전히 부합해야 합니다.
3. 제공된 소스 자료 및 저장된 내용에 **직접 등장하지 않는 외부의 엉뚱한 타 공학/역학 분야 이론(예: 소스에 직접 언급되지 않은 동역학, 구조역학, 진동학, 임계감쇠, 단자유도 시스템, 고유진동수, 또는 그 외 외부 임의 주제 등)이나 임의의 다른 지식을 출제 규칙에 주입하여 환각(Hallucination) 문제를 유발하지 마십시오.**
4. 오직 제공된 소스 본문 텍스트 내에 **단어 및 수식으로 명시되어 있는 범위 내로만 출제 범위를 100% 철저히 한정**하십시오. 소스에 없는 타분야 내용을 엮거나 상상하여 문제를 구성할 경우 심각한 출제 오류로 간주됩니다.
5. 객관식 모든 보기(options) 및 해설 역시 오직 소스 문서 내용의 문장과 지식들을 변형/결합하여 만들어야 하며, 본문과 아예 무관한 엉뚱한 외부 용어나 가상의 기술적 지식을 보기에 혼합하는 것을 절대 금지합니다.`;

normContent = normContent.replace(normalizeNewlines(oldExamRules2), normalizeNewlines(newExamRules2));

console.log('4. Patched topic isolation formatting and exam prompts rules successfully.');

// Write back keeping original platform newlines style
fs.writeFileSync(filePath, normContent.replace(/\n/g, newline), 'utf8');
console.log('All patches applied to server/index.js successfully!');
