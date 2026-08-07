const fs = require('fs');
let src = fs.readFileSync('client/src/utils/latexUtils.js', 'utf8');
const fnStart = src.indexOf('export function healLatexFormulas');
const fnEnd = src.indexOf('export function healDeep');
let fnStr = src.substring(fnStart, fnEnd).replace('export ', '');

let lines = fnStr.split('\n');
let modifiedFn = lines.map(line => {
  if (line.includes('processed = processed.replace') || line.includes('text = text.replace') || line.includes('processed = formatConsecutiveFormulas')) {
    return line + '\n  console.log("After:", `' + line.trim().replace(/`/g, '') + '`, "->", typeof processed !== "undefined" ? processed : text);';
  }
  return line;
}).join('\n');

const fullScript = 'const { healCorruptedKatexHtml } = require("./testHelper.js");\n' + modifiedFn + '\nconsole.log("FINAL:", healLatexFormulas("\\\\\\\\nu"));';
fs.writeFileSync('testDebug.js', fullScript);
