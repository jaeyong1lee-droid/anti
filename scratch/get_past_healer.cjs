const { execSync } = require('child_process');

// Let's inspect git commits that modified healLatexFormulas
const log = execSync('git log -S healLatexFormulas --oneline', { encoding: 'utf8' });
console.log('Commits modifying healLatexFormulas:\n', log);

// Let's extract healLatexFormulas from a commit that was known to be working.
// Let's check commit be4c32e or f377627 or 134ca36
const commit = 'be4c32e'; // The commit before our modifications
console.log(`Extracting from commit ${commit}...`);
const fileContent = execSync(`git show ${commit}:server/index.js`, { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' });

const lines = fileContent.split('\n');
const startIndex = lines.findIndex(l => l.includes('function healLatexFormulas('));
const tokenizeStartIndex = lines.findIndex(l => l.includes('function tokenizeForHealing('));

console.log('tokenizeStartIndex:', tokenizeStartIndex);
console.log('startIndex:', startIndex);

const endIndex = lines.findIndex((l, idx) => idx > startIndex && l.includes('return result;')) + 1;
console.log('endIndex:', endIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const code = lines.slice(startIndex, endIndex + 1).join('\n');
  console.log('\n=== PAST HEALER CODE ===\n');
  console.log(code);
} else {
  console.log('Failed to find start/end indices');
}
