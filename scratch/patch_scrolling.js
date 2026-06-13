const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/App.jsx');
let code = fs.readFileSync(filePath, 'utf8');

// Target 1: Quiz scroll
const target1 = `                                          const cards = quizBodyRef.current?.querySelectorAll('.quiz-card-item');
                                          if (cards && cards[idx + 1]) {
                                            quizBodyRef.current?.scrollTo({ top: cards[idx + 1].offsetTop, behavior: 'smooth' });
                                          }`;

const target1LF = target1.replace(/\\r\\n/g, '\\n').replace(/\r\n/g, '\n');

const replacement1 = `                                          const cards = quizBodyRef.current?.querySelectorAll('.quiz-card-item');
                                          if (cards && cards[idx]) {
                                            quizBodyRef.current?.scrollTo({ top: cards[idx].offsetTop, behavior: 'smooth' });
                                          }`;

let idx1 = code.indexOf(target1);
let len1 = target1.length;
if (idx1 === -1) {
  idx1 = code.indexOf(target1LF);
  len1 = target1LF.length;
}

if (idx1 === -1) {
  console.error("Error: Could not find target1 in App.jsx");
  process.exit(1);
}

code = code.substring(0, idx1) + replacement1 + code.substring(idx1 + len1);

// Target 2: Exam scroll
const target2 = `                                        const cards = examBodyRef.current?.querySelectorAll('.exam-card-item');
                                        if (cards && cards[idx + 1]) {
                                          examBodyRef.current?.scrollTo({ top: cards[idx + 1].offsetTop, behavior: 'smooth' });
                                        }`;

const target2LF = target2.replace(/\\r\\n/g, '\\n').replace(/\r\n/g, '\n');

const replacement2 = `                                        const cards = examBodyRef.current?.querySelectorAll('.exam-card-item');
                                        if (cards && cards[idx]) {
                                          examBodyRef.current?.scrollTo({ top: cards[idx].offsetTop, behavior: 'smooth' });
                                        }`;

let idx2 = code.indexOf(target2);
let len2 = target2.length;
if (idx2 === -1) {
  idx2 = code.indexOf(target2LF);
  len2 = target2LF.length;
}

if (idx2 === -1) {
  console.error("Error: Could not find target2 in App.jsx");
  process.exit(1);
}

code = code.substring(0, idx2) + replacement2 + code.substring(idx2 + len2);

fs.writeFileSync(filePath, code, 'utf8');
console.log("Successfully patched App.jsx scrolling");
