const fs = require('fs');
const originalCode = fs.readFileSync('client/src/utils/latexUtils.js', 'utf8');

function testWith(replaceRegex, replacement) {
  const code = originalCode.replace(replaceRegex, replacement);
  fs.writeFileSync('client/src/utils/latexUtils.js', code);
  
  const { execSync } = require('child_process');
  let output;
  try {
    output = execSync('"c:/Users/airfo/OneDrive - 대우건설/안티/.node_portable/node-v20.11.1-win-x64/node.exe" "c:/Users/airfo/OneDrive - 대우건설/안티/test_heal.js"', { encoding: 'utf8' });
  } catch (e) {
    output = e.stdout || e.stderr || e.message;
  }
  
  fs.writeFileSync('client/src/utils/latexUtils.js', originalCode);
  return output.trim();
}

console.log('No healCorruptedKatexHtml:\\n', testWith(/processed = healCorruptedKatexHtml\(text\);/, 'processed = text;'));
console.log('No formatConsecutiveFormulas:\\n', testWith(/processed = formatConsecutiveFormulas\(processed\);/, ''));
console.log('No replace(/\\[₩\\\\\\\\\\]\\?t\\)/gi:\\n', testWith(/processed = processed.replace\(\/\\\\\(\\[₩\\\\\\\\\\]\\\?t\\\\\)\/gi, \'\\(\\\\\\$\\$\\\\\\Delta t\\\\\\$\\)\'\);/, ''));
console.log('No 516 (first parentheses replace):\\n', testWith(/processed = processed.replace\(\/\\\\\(\\\(\\[\^\\(\\)\\\\n\\]\\*\\\?\\)\\\\\$\\\\\$\\s\\*\\[\\\\s\\\\S\\]\\*\\\?\\s\\*\\\\\\$\\\\\$\\s\\*\\[\^\\(\\)\\\\n\\]\\*\\\?\\)\\\/g, \'\\(\\$1 \\$\\$\\$2\\$\\$ \\$3\\)\'\);/, ''));
