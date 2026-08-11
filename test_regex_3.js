const text = `<svg width="100%" viewBox="0 0 800 450" style="background-color: #1e1e1e;" xmlns="http://www.w3.org/2000/svg">
<!-- 배경 그리드 및 영역 구분 →
<rect width="800" height="450" fill="#1e1e1e"/>

<!-- 지표면 선 →
<line x1="100" y1="120" x2="700" y2="120" stroke="#94a3b8" stroke-width="3" stroke-dasharray="8,4"/>
</svg>`;
const re = /<\/?(div|table|tr|td|th|tbody|thead|tfoot|p|span|br|hr|strong|em|ul|ol|li|h[1-6]|b|i|a|img|code|pre|style|html|body|button|svg|path|polyline|line|polygon|rect|circle|foreignObject|text|g|defs|marker|clipPath|pattern|ellipse|image)(?:\s+[^>]*)?\/?>/i;
console.log('hasHtml:', re.test(text));
