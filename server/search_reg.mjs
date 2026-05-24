import fs from 'fs';

const path = 'c:\\Users\\airfo\\OneDrive\\바탕 화면\\안티\\client\\src\\App.jsx';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('오늘 공부한 토픽 등록')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
