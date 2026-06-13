import { healLatexFormulas } from '../client/src/utils/latexUtils.js';

const rawText = `4. 실무적 시사점 및 대책 * * * 터널 설계: 터널 굴착 시 아칭 효과를 적극 활용하면 지보재에 작용하는 하중을 경감시킬 수 있습니다. * * * 옹벽 설계: 옹벽 배면 지반의 아칭 효과를 고려하여 토압을 산정할 때, 뒤채움재의 다짐도와 내부마찰각 \\phi 를 높게 유지하면 옹벽에 작용하는 측방 토압을 효과적으로 제어할 수 있습니다. * * * 매설관 설계**: 관 상부의 흙을 의도적으로 이완시켜 아칭 효과를 유도하는 '매설관의 하중 경감 공법' 등은 이러한 역학적 원리를 실무에 적용한 대표적인 사례입니다.`;

const healed = healLatexFormulas(rawText);

function convertMarkdownToHtml(mdText, isMarkdown = false) {
  const mathBlocks = [];
  let placeholderIndex = 0;
  let tempText = mdText
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');

  console.log("Step 0 (Normalize newlines):", JSON.stringify(tempText));

  tempText = tempText.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (match) => {
    const placeholder = `___BLOCK_MATH_${placeholderIndex}___`;
    mathBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  tempText = tempText.replace(/\$([^\$]+?)\$/g, (match) => {
    const placeholder = `___INLINE_MATH_${placeholderIndex}___`;
    mathBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  tempText = tempText.replace(/([^\n])\s*(#{2,6}\s+)/g, '$1\n\n$2');
  
  // Force line breaks before *** or * * * if not already preceded by a newline
  tempText = tempText.replace(/([^\n])[ \t]*(?:\* \* \*|\*\*\*)[ \t]*/g, '$1\n* * * ');

  tempText = tempText.replace(/\*\*([^\*]+?)\*\*/g, '<strong style="color: #f1f5f9; font-weight: 700;">$1</strong>');

  tempText = tempText.replace(/^(###+)\s+(.*?)$/gm, (match, hashes, title) => {
    return `<h3 style="font-weight: 800;">${title}</h3>`;
  });

  if (isMarkdown) {
    tempText = tempText.replace(/^[ \t]*(?:\* \* \*|\*\*\*)[ \t]*(.*?)$/gm, 'BULLET: $1');
    tempText = tempText.replace(/^[ \t]*(?:\*|-)[ \t]+(.*?)$/gm, 'BULLET-SIMPLE: $1');
  }

  console.log("Step 3 (After list item replacement):", JSON.stringify(tempText));

  tempText = tempText.replace(/\n\n/g, '<div style="height: 0.8rem;"></div>');
  
  console.log("Step 4 (After \\n\\n replacement):", JSON.stringify(tempText));

  tempText = tempText.replace(/\n/g, '<br/>');

  return tempText;
}

convertMarkdownToHtml(healed, true);
