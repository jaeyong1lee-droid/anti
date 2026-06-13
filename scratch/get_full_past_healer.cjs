const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const commit = 'be4c32e';
console.log(`Extracting complete healLatexFormulas from commit ${commit}...`);
const fileContent = execSync(`git show ${commit}:server/index.js`, { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' });

const lines = fileContent.split('\n');
const tokenizeStartIndex = lines.findIndex(l => l.includes('function tokenizeForHealing('));
const startIndex = lines.findIndex(l => l.includes('function healLatexFormulas('));

const healEndLineIndex = lines.findIndex((l, idx) => idx > startIndex && l.includes('return result;')) + 1;

console.log('tokenizeStartIndex:', tokenizeStartIndex);
console.log('startIndex:', startIndex);
console.log('healEndLineIndex:', healEndLineIndex);

const tokenizeCode = lines.slice(tokenizeStartIndex, startIndex).join('\n');
const healerCode = lines.slice(startIndex, healEndLineIndex + 1).join('\n');

const outPath = path.join(__dirname, 'past_healer.js');
fs.writeFileSync(outPath, tokenizeCode + '\n' + healerCode);
console.log(`Wrote past healer code to ${outPath}`);
