const match = '<svg\nwidth="100%" viewBox="0 0 900 550" style="background-color: #1e1e1e;"\nxmlns="http://www.w3.org/2000/svg">';
const re = /<([a-zA-Z가-힣][^>]*)>/g;
const res = match.replace(re, (m, c) => {
  const tagMatch = m.match(/^<\/?(div|table|tr|td|th|tbody|thead|tfoot|p|span|br|hr|strong|em|ul|ol|li|h[1-6]|b|i|a|img|code|pre|style|html|body|button|svg|path|polyline|line|polygon|rect|circle|foreignObject|text|g|defs|marker|clipPath|pattern|ellipse|image)(?:\s|>|\/>)/i);
  if(tagMatch) return m;
  return '&lt;' + c + '>';
});
console.log("Result:", res);
