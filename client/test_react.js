import React from 'react';
import ReactDOMServer from 'react-dom/server';

const text = `<svg width="100%" viewBox="0 0 800 450" style="background-color: #1e1e1e;" xmlns="http://www.w3.org/2000/svg">
<!-- 배경 그리드 및 영역 구분 →
<rect width="800" height="450" fill="#1e1e1e"/>
</svg>`;

const hasHtml = /<\/?(div|table|tr|td|th|tbody|thead|tfoot|p|span|br|hr|strong|em|ul|ol|li|h[1-6]|b|i|a|img|code|pre|style|html|body|button|svg|path|polyline|line|polygon|rect|circle|foreignObject|text|g|defs|marker|clipPath|pattern|ellipse|image)(?:\s+[^>]*)?\/?>/i.test(text);

let htmlContent = text;
if (hasHtml) {
  htmlContent = htmlContent.replace(/<([a-zA-Z가-힣][^>]*)>/g, (match, content) => {
    const tagMatch = match.match(/^<\/?(div|table|tr|td|th|tbody|thead|tfoot|p|span|br|hr|strong|em|ul|ol|li|h[1-6]|b|i|a|img|code|pre|style|html|body|button|svg|path|polyline|line|polygon|rect|circle|foreignObject|text|g|defs|marker|clipPath|pattern|ellipse|image)(?:\s|>|\/>)/i);
    if (tagMatch) return match;
    return `&lt;${content}>`;
  });
}

const element = React.createElement('div', { dangerouslySetInnerHTML: { __html: htmlContent } });
console.log(ReactDOMServer.renderToString(element));
