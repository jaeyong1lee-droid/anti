const fs = require('fs');

const filePath = 'c:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = '{/* ===== ESSENTIAL FORMULA THEORY DERIVATION MODAL ===== */}';
const endMarker = '{/* ===== ESSENTIAL ANSWERSHEET STUDY MODAL ===== */}';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1) {
  console.error('Start marker not found!');
  process.exit(1);
}

if (endIndex === -1) {
  console.error('End marker not found!');
  process.exit(1);
}

console.log(`Deleting from index ${startIndex} to ${endIndex}...`);

const before = content.substring(0, startIndex);
const after = content.substring(endIndex);

content = before + after;

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully deleted the Theory modal block!');
