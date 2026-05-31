const fs = require('fs');
const path = require('path');

const appJsxPath = path.join(__dirname, '..', 'client', 'src', 'App.jsx');
console.log("Reading App.jsx from:", appJsxPath);

let content = fs.readFileSync(appJsxPath, 'utf8');

// Normalize line endings to LF for easy replacement
const isCRLF = content.includes('\r\n');
if (isCRLF) {
  content = content.replace(/\r\n/g, '\n');
}

// 1. Remove automatic option explanation fetch on option click (just in case)
const oldOptionClick = `                                    setSelectedAnswers(prev => ({ ...prev, [idx]: opt }));
                                    handleRequestOptionExplanation(idx, q.question, q.options, q.answer);`;

const newOptionClick = `                                    setSelectedAnswers(prev => ({ ...prev, [idx]: opt }));`;

if (content.includes(oldOptionClick)) {
  content = content.replace(oldOptionClick, newOptionClick);
  console.log("Successfully replaced oldOptionClick!");
}

// 2. Locate and replace the buttons block using a robust regex
// We match from the comment {/* 보기별 정밀 분석 (왜 오답이고 정답인지) AI 설명 */}
// all the way to the closing div of the detailed answer section.
// Let's design a regex that matches this block precisely:
const regex = /\{\/\*\s*보기별\s*정밀\s*분석\s*\(왜\s*오답이고\s*정답인지\)\s*AI\s*설명\s*\*\/\}.*?\{\/\*\s*Detailed\s*Answer\s*Button\s*\*\/\}\s*<div\s+className="mt-3\s+pt-2\s+border-t\s+border-slate-700\/50">.*?<\/div>\s*<\/div>/s;

if (!regex.test(content)) {
  console.error("Could not find the target buttons block using regex!");
} else {
  // Read the replacement buttons block from file
  const replacementButtonsBlock = fs.readFileSync(path.join(__dirname, 'replacementButtonsBlock.txt'), 'utf8').replace(/\r\n/g, '\n');
  content = content.replace(regex, replacementButtonsBlock);
  console.log("Successfully replaced buttons block using regex!");
}

// Convert back to CRLF if original file had CRLF
if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(appJsxPath, content, 'utf8');
console.log("Successfully completed App.jsx patch!");
