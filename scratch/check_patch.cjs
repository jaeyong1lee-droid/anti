const fs = require('fs');
const content = fs.readFileSync('server/index.js', 'utf8');

// Check rule5 patch
if (content.includes('rule5Tokens = tokenizeForHealing(healed)')) {
  console.log('Rule 5 patch: FOUND');
} else {
  console.log('Rule 5 patch: NOT FOUND');
}

// Check original unsafe line still present
if (content.includes("healed = healed.replace(/\\\\\\\\([a-zA-Z]+)/g, '\\\\$1');")) {
  console.log('Old rule 5 line: STILL PRESENT (patch may not have worked)');
} else {
  console.log('Old rule 5 line: REMOVED');
}

// Count opening and closing braces in the function body only
const funcStart = content.indexOf('function healLatexFormulas(text)');
const funcEnd = content.indexOf('\nfunction healQuizQuestionObject', funcStart);
const funcBody = content.substring(funcStart, funcEnd);

let depth = 0;
let inStr = null;
let escape = false;
for (let i = 0; i < funcBody.length; i++) {
  const c = funcBody[i];
  if (escape) { escape = false; continue; }
  if (c === '\\') { escape = true; continue; }
  if (inStr) {
    if (c === inStr) inStr = null;
  } else {
    if (c === '"' || c === "'" || c === '`') inStr = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
  }
}
console.log('healLatexFormulas brace balance depth:', depth, depth === 0 ? '(OK)' : '(MISMATCH!)');
