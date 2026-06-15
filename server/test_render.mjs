import { healLatexFormulas } from './utils/latexUtils.js';

// Convert Markdown to HTML helper from client/src/App.jsx
function convertMarkdownToHtml(mdText, isMarkdown = false, highlightBold = false, isTutor = false) {
  const mathBlocks = [];
  let placeholderIndex = 0;
  
  let tempText = mdText
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');

  // Protect $$ ... $$
  tempText = tempText.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (match) => {
    const placeholder = `___BLOCK_MATH_${placeholderIndex}___`;
    mathBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  // Protect $ ... $
  tempText = tempText.replace(/\$([^\$]+?)\$/g, (match) => {
    const placeholder = `___INLINE_MATH_${placeholderIndex}___`;
    mathBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  tempText = tempText.replace(/\n\s*\n/g, '\n\n');
  tempText = tempText.replace(/\n{3,}/g, '\n\n');
  tempText = tempText.replace(/\n+(___BLOCK_MATH_\d+___)\n+/g, '\n$1\n');
  tempText = tempText.replace(/([^\n])\s*(#{2,6}\s+)/g, '$1\n\n$2');

  const boldColor = (isMarkdown && highlightBold) ? '#fbbf24' : '#f1f5f9';
  tempText = tempText.replace(/\*\*([^\*]+?)\*\*/g, `<strong style="color: ${boldColor}; font-weight: 700;">$1</strong>`);
  
  tempText = tempText.replace(/^(###+)\s+(.*?)$/gm, `<h3 style="color: #f1f5f9;">$2</h3>`);
  tempText = tempText.replace(/^(##)\s+(.*?)$/gm, `<h2 style="color: #f8fafc;">$2</h2>`);
  tempText = tempText.replace(/^(#)\s+(.*?)$/gm, `<h1 style="color: #f8fafc;">$2</h1>`);

  tempText = tempText.replace(/\n\n/g, '<div style="height: 0.8rem;"></div>');
  tempText = tempText.replace(/\n/g, '<br/>');

  // Restore math blocks
  mathBlocks.forEach(block => {
    while (tempText.includes(block.placeholder)) {
      tempText = tempText.replace(block.placeholder, () => block.content);
    }
  });

  return tempText;
}

const rawText = `각 벽체 형식에 따른 최대 배면 수평변위량(d_{H,max})은 다음과 같이 계산됩니다.

1) 연성 벽체 공법 적용 시 최대 변위량:

d_{H,max1} = H \\cdot 0.50\\% = 20 \\text{ m} \\times 0.005 = 0.10 \\text{ m} = 100 \\text{ mm}$2) 고강성 지하연속벽 공법 적용 시 최대 변위량:$d_{H,max2} = H \\cdot 0.15\\% = 20 \\text{ m} \\times 0.0015 = 0.03 \\text{ m} = 30 \\text{ mm}$3) 공법 변경을 통해 감소(억제)되는 변위량:$\\Delta d_{H,max} = 100 \\text{ mm} - 30 \\text{ mm} = 70 \\text{ mm}`;

const healedOnce = healLatexFormulas(rawText);
console.log('=== HEALED ONCE ===');
console.log(healedOnce);

const healedTwice = healLatexFormulas(healedOnce);
console.log('\n=== HEALED TWICE ===');
console.log(healedTwice);

const html = convertMarkdownToHtml(healedTwice, true, false, false);
console.log('\n=== AFTER convertMarkdownToHtml (on twice healed) ===');
console.log(html);

// Now simulate the LatexRenderer inline math parsing
let htmlContent = html;
console.log('\n=== MATCHED INLINE MATH BLOCKS ===');
htmlContent.replace(/\$([^\$]+?)\$/gs, (m, math) => {
  console.log('Match found:', JSON.stringify(math));
  return m;
});
