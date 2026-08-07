const fs = require('fs');
const latexUtils = fs.readFileSync('./client/src/utils/latexUtils.js', 'utf8');

// evaluate the function
const script = `
  ${latexUtils.substring(latexUtils.indexOf('const healCorruptedKatexHtml'), latexUtils.indexOf('export function healLatexFormulas'))}
  const text = '특히 $\\sqrt{$ $\\sqrt{\\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';
  console.log(healCorruptedKatexHtml(text));
`;

eval(script);
