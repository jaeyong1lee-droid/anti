import fs from 'fs';
import path from 'path';

const appJsxPath = path.resolve('client/src/App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8');

const lines = content.replace(/\r\n/g, '\n').split('\n');

// Review ternary
const reviewTernaryIndex = lines.findIndex((l, idx) => l.includes("adjustingInputKey !== `r_${idx}` ? (") && idx > 3000);
if (reviewTernaryIndex !== -1) {
  console.log(`Review ternary starts at line ${reviewTernaryIndex + 1}`);
  let reviewEndIndex = -1;
  for (let i = reviewTernaryIndex + 1; i < lines.length; i++) {
    if (lines[i].trim() === ')}') {
      reviewEndIndex = i;
      break;
    }
  }
  if (reviewEndIndex !== -1) {
    console.log(`Review ternary ending line found at ${reviewEndIndex + 1}: [${lines[reviewEndIndex]}]`);
    lines[reviewEndIndex] = lines[reviewEndIndex].replace(')}', ')}');
    console.log(`Updated Review ternary ending line to: [${lines[reviewEndIndex]}]`);
  }
}

// Exam ternary
const examTernaryIndex = lines.findIndex((l, idx) => l.includes("adjustingInputKey !== `e_${idx}` ? (") && idx > 4000);
if (examTernaryIndex !== -1) {
  console.log(`Exam ternary starts at line ${examTernaryIndex + 1}`);
  let examEndIndex = -1;
  for (let i = examTernaryIndex + 1; i < lines.length; i++) {
    if (lines[i].trim() === ')}') {
      examEndIndex = i;
      break;
    }
  }
  if (examEndIndex !== -1) {
    console.log(`Exam ternary ending line found at ${examEndIndex + 1}: [${lines[examEndIndex]}]`);
    lines[examEndIndex] = lines[examEndIndex].replace(')}', ')}');
    console.log(`Updated Exam ternary ending line to: [${lines[examEndIndex]}]`);
  }
}

fs.writeFileSync(appJsxPath, lines.join('\n'), 'utf8');
console.log('SUCCESS: Parentheses fixed!');
