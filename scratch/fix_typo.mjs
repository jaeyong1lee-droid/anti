import fs from 'fs';
import path from 'path';

const appJsxPath = path.resolve('client/src/App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8');

const lines = content.replace(/\r\n/g, '\n').split('\n');

// Find the line index containing `{adjustingLoading[`e_${idx}` && (`
const targetLineIndex = lines.findIndex(l => l.includes('{adjustingLoading[`e_${idx}` && ('));

if (targetLineIndex !== -1) {
  console.log(`Found typo at line ${targetLineIndex + 1}: ${lines[targetLineIndex]}`);
  lines[targetLineIndex] = lines[targetLineIndex].replace('{adjustingLoading[`e_${idx}` && (', '{adjustingLoading[`e_${idx}`] && (');
  fs.writeFileSync(appJsxPath, lines.join('\n'), 'utf8');
  console.log('SUCCESS: Fixed typo!');
} else {
  console.error('ERROR: Could not find typo line!');
}
