import fs from 'fs';

const path = 'c:\\Users\\airfo\\OneDrive\\바탕 화면\\안티\\server\\index.js';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('static') || line.includes('dist') || line.includes('express.static')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
