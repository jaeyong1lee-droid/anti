const fs = require('fs');
const code = fs.readFileSync('c:/Users/airfo/OneDrive - 대우건설/안티/client/src/utils/latexUtils.js', 'utf8');

const startIdx = code.indexOf('export function healLatexFormulas(');
const endIdx = code.indexOf('export function fixMisalignedKaTeX');

let body = code.substring(startIdx, endIdx);
body = body.replace('export function healLatexFormulas', 'function healLatexFormulas');

let instrumentedBody = '';
let lines = body.split('\n');
let index = 0;
for(let line of lines) {
  instrumentedBody += line + '\n';
  if (line.includes('processed = processed.replace(') || line.includes('text = text.replace(')) {
    instrumentedBody += `if (processed !== _lastP) { console.log('Changed at ' + ${index} + ':\\n' + processed); _lastP = processed; }\n`;
  }
  index++;
}

const finalScript = `
  const { healInvertedDelimiters, healCorruptedKatexHtml } = require('./client/src/utils/latexUtils.js');
  let _lastP = '';
  ${instrumentedBody}
  
  const text = '특히 $\\sqrt{$ $\\sqrt{\\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';
  console.log(healLatexFormulas(text));
`;

fs.writeFileSync('c:/Users/airfo/OneDrive - 대우건설/안티/test_trace_full.js', finalScript);
