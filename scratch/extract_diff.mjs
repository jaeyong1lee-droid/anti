import { execSync } from 'child_process';

const diff = execSync('git show d5ce241 -- client/src/App.jsx', { encoding: 'utf8' });
const lines = diff.split('\n');

console.log('Printing all added lines containing useState, handle, or function definitions:');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('+') && !lines[i].startsWith('+++')) {
    const l = lines[i].substring(1);
    if (l.includes('useState') || l.includes('handle') || l.includes('const') || l.includes('function')) {
      console.log(`Line ${i}: ${lines[i]}`);
    }
  }
}
