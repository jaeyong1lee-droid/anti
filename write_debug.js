const fs = require('fs');
let code = fs.readFileSync('client/src/utils/latexUtils.js', 'utf8');

let newCode = '';
let count = 0;
for (let line of code.split('\n')) {
  newCode += line + '\n';
  if (line.includes('processed = processed.replace(') || line.includes('processed = text.replace(') || line.includes('text = text.replace(')) {
    newCode += `console.log("Change ${count}:", processed);\n`;
    count++;
  }
}

fs.writeFileSync('client/src/utils/latexUtils_debug.js', newCode);

const finalScript = `
  const { healLatexFormulas } = require('./client/src/utils/latexUtils_debug.js');
  const text = '특히 $\\sqrt{$ $\\sqrt{\\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';
  console.log('Final:', healLatexFormulas(text));
`;
fs.writeFileSync('test_debug.js', finalScript);
