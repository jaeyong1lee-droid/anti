const fs = require('fs');
const path = require('path');

const cleanFuncPath = path.join(__dirname, 'clean_function.js');
console.log("Reading clean functions from:", cleanFuncPath);

const targetFunctionCode = fs.readFileSync(cleanFuncPath, 'utf8');
const base64Code = Buffer.from(targetFunctionCode).toString('base64');

const patchScriptContent = `const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'index.js');
console.log("Reading file:", filePath);

let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF for easy replacement
const isCRLF = content.includes('\\r\\n');
if (isCRLF) {
  content = content.replace(/\\r\\n/g, '\\n');
}

// 1. Find the start index of healLatexFormulas function and replace it
const funcStart = content.indexOf('function healLatexFormulas(text) {');
if (funcStart === -1) {
  console.error("Could not find function healLatexFormulas in server/index.js!");
  process.exit(1);
}

let braceCount = 0;
let funcEnd = -1;
let started = false;

for (let i = funcStart; i < content.length; i++) {
  if (content[i] === '{') {
    braceCount++;
    started = true;
  } else if (content[i] === '}') {
    braceCount--;
  }
  
  if (started && braceCount === 0) {
    funcEnd = i + 1;
    break;
  }
}

if (funcEnd === -1) {
  console.error("Could not find matching closing brace for healLatexFormulas!");
  process.exit(1);
}

// Decode our target functions code from base64 to ensure 100% exact characters
const base64Code = "${base64Code}";
const newFuncs = Buffer.from(base64Code, 'base64').toString('utf8');

// Perform the function replacement
content = content.substring(0, funcStart) + newFuncs + content.substring(funcEnd);
console.log("Successfully replaced function definitions!");

// 2. Perform the question mapping replacements to heal LaTeX inside question objects
// We replace the maps for core questions, fallback questions, and AI questions
const searchReplacements = [
  {
    target: \`        const cleanedQuestions = questions.map(q => ({\n          ...q,\n          question: cleanQuizQuestion(q.question)\n        }));\`,
    replace: \`        const cleanedQuestions = questions.map(q => healQuizQuestionObject({\n          ...q,\n          question: cleanQuizQuestion(q.question)\n        }));\`
  },
  {
    target: \`      const cleanedCore = coreQuestions.map(q => ({\n        ...q,\n        question: cleanQuizQuestion(q.question)\n      }));\`,
    replace: \`      const cleanedCore = coreQuestions.map(q => healQuizQuestionObject({\n        ...q,\n        question: cleanQuizQuestion(q.question)\n      }));\`
  },
  {
    target: \`      const cleanedFallback = fallbackQuestions.map(q => ({\n        ...q,\n        question: cleanQuizQuestion(q.question)\n      }));\`,
    replace: \`      const cleanedFallback = fallbackQuestions.map(q => healQuizQuestionObject({\n        ...q,\n        question: cleanQuizQuestion(q.question)\n      }));\`
  },
  {
    target: \`          question: {\n            ...selectedQ,\n            question: cleanQuizQuestion(selectedQ.question)\n          },\`,
    replace: \`          question: healQuizQuestionObject({\n            ...selectedQ,\n            question: cleanQuizQuestion(selectedQ.question)\n          }),\`
  },
  {
    target: \`        question: {\n          ...parsedQuestion,\n          question: cleanQuizQuestion(parsedQuestion.question)\n        },\`,
    replace: \`        question: healQuizQuestionObject({\n          ...parsedQuestion,\n          question: cleanQuizQuestion(parsedQuestion.question)\n        }),\`
  },
  {
    target: \`    res.json({ questions: finalQuestions, total: finalQuestions.length, topicCount: topics.length });\`,
    replace: \`    const healedFinalQuestions = finalQuestions.map(q => healQuizQuestionObject(q));\n    res.json({ questions: healedFinalQuestions, total: healedFinalQuestions.length, topicCount: topics.length });\`
  }
];

searchReplacements.forEach((item, idx) => {
  if (!content.includes(item.target)) {
    console.warn(\`Warning: Replacement \${idx + 1} target not found in server/index.js!\`);
  } else {
    content = content.replace(item.target, item.replace);
    console.log(\`Successfully applied replacement \${idx + 1}!\`);
  }
});

// Convert back to CRLF if original file had CRLF
if (isCRLF) {
  content = content.replace(/\\n/g, '\\r\\n');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully patched server/index.js via clean Base64 + Mapping!");
`;

fs.writeFileSync(path.join(__dirname, 'patch_server.js'), patchScriptContent, 'utf8');
console.log("Generated patch_server.js successfully from clean_function.js!");
