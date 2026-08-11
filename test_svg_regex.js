const text = `<svg width="100%" viewBox="0 0 600 400" style="background-color: #1e1e1e;" xmlns="http://www.w3.org/2000/svg">
<!-- 배경 그리드 및 테두리 -->
<rect width="100%" height="100%" fill="#1e1e1e" />`;

let htmlContent = text;
htmlContent = htmlContent.replace(/<([a-zA-Z가-힣][^>]*)>/g, (match, content) => {
  const tagMatch = match.match(/^<\/?(div|table|tr|td|th|tbody|thead|tfoot|p|span|br|hr|strong|em|ul|ol|li|h[1-6]|b|i|a|img|code|pre|style|html|body|button|svg|path|polyline|line|polygon|rect|circle|foreignObject|text|g|defs|marker|clipPath|pattern|ellipse|image)(?:\s|>|\/>)/i);
  if (tagMatch) return match;
  return `&lt;${content}>`;
});

console.log('htmlContent after replace:', htmlContent);
