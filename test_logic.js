const fs = require('fs');
const { convertMarkdownToHtml } = require('./client/src/utils/renderingHelpers.js');

let text = `동을 직관적으로 증명하기 위해 필수적으로 암기하고 그려야 하는 **랭킨(Rankine) 토압 이론에 따른 옹벽의 주동 및 수동 토압 분포 단면도**입니다.

<svg width="100%" viewBox="0 0 800 450" style="background-color: #1e1e1e;" xmlns="http://www.w3.org/2000/svg">
<!-- 배경 그리드 및 영역 구분 →
<rect width="800" height="450" fill="#1e1e1e"/>

<!-- 지표면 선 →
<line x1="100" y1="120" x2="700" y2="120" stroke="#94a3b8" stroke-width="3" stroke-dasharray="8,4"/>
</svg>`;

let parsedText = text.replace(/\\\s*\(/g, '\\(').replace(/\\\s*\)/g, '\\)').replace(/\\\(([\s\S]*?)\\\)/g, (m, p1) => '$' + p1.trim() + '$');
let renderText = parsedText; // simplified

let cleanedText = renderText;
cleanedText = convertMarkdownToHtml(cleanedText, true, true, true, false);

const hasHtml = /<\/?(div|table|tr|td|th|tbody|thead|tfoot|p|span|br|hr|strong|em|ul|ol|li|h[1-6]|b|i|a|img|code|pre|style|html|body|button|svg|path|polyline|line|polygon|rect|circle|foreignObject|text|g|defs|marker|clipPath|pattern|ellipse|image)(?:\s+[^>]*)?\/?>/i.test(cleanedText);

console.log('hasHtml:', hasHtml);
if (hasHtml) {
  let htmlContent = cleanedText;
  htmlContent = htmlContent.replace(/<([a-zA-Z가-힣][^>]*)>/g, (match, content) => {
    const tagMatch = match.match(/^<\/?(div|table|tr|td|th|tbody|thead|tfoot|p|span|br|hr|strong|em|ul|ol|li|h[1-6]|b|i|a|img|code|pre|style|html|body|button|svg|path|polyline|line|polygon|rect|circle|foreignObject|text|g|defs|marker|clipPath|pattern|ellipse|image)(?:\s|>|\/>)/i);
    if (tagMatch) return match;
    return `&lt;${content}>`;
  });
  console.log('FINAL HTMLCONTENT:', htmlContent);
}
