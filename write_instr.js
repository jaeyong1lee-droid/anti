const fs = require('fs');

const code = fs.readFileSync('./client/src/utils/latexUtils.js', 'utf8');

// replace healLatexFormulas block
const originalBlock = code.substring(code.indexOf('export function healLatexFormulas'), code.indexOf('export function fixMisalignedKaTeX'));

let lines = originalBlock.split('\n');
let instrumented = 'function healLatexFormulas' + lines[0].substring(lines[0].indexOf('('));
for (let i = 1; i < lines.length; i++) {
  instrumented += lines[i] + '\n';
  if (lines[i].includes('processed = processed.replace') || lines[i].includes('text = text.replace') || lines[i].includes('processed = healCorruptedKatexHtml') || lines[i].includes('processed = healInvertedDelimiters')) {
    instrumented += `if (processed !== _dbg) { console.log('Line ${i+505}:', processed); _dbg = processed; }\n`;
  }
}

const finalScript = `
  const { healInvertedDelimiters, healCorruptedKatexHtml } = require('./client/src/utils/latexUtils.js');
  let _dbg = '';
  ${instrumented}
  
  const text = '특히 $\\sqrt{$ $\\sqrt{\\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';
  _dbg = text;
  console.log('Original:', text);
  console.log('Final:', healLatexFormulas(text));
`;

fs.writeFileSync('test_instrumented.js', finalScript);
