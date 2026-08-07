const fs = require('fs');

const orig = fs.readFileSync('client/src/utils/latexUtils.js', 'utf8');

let lines = orig.split('\n');
let inside = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export function healLatexFormulas')) inside = true;
  if (inside && lines[i].includes('export function fixMisalignedKaTeX')) inside = false;
  
  if (inside) {
    if (lines[i].includes('processed = replaceRoots(processed);')) {
      lines[i] = lines[i] + `\n  console.log('[AFTER replaceRoots]', processed);\n`;
    }
    if (lines[i].includes('processed = formatConsecutiveFormulas(processed);')) {
      lines[i] = lines[i] + `\n  console.log('[AFTER formatConsecutiveFormulas]', processed);\n`;
    }
  }
}

fs.writeFileSync('client/src/utils/latexUtils.js', lines.join('\n'));

const { execSync } = require('child_process');
try {
  const out = execSync('"c:/Users/airfo/OneDrive - 대우건설/안티/.node_portable/node-v20.11.1-win-x64/node.exe" "c:/Users/airfo/OneDrive - 대우건설/안티/test_heal.js"', { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.log(e.stdout || e.message);
}

fs.writeFileSync('client/src/utils/latexUtils.js', orig);
