const fs = require('fs');

const orig = fs.readFileSync('client/src/utils/latexUtils.js', 'utf8');

// I will insert console.log AFTER EVERY line containing "processed ="
let instrumented = '';
let lines = orig.split('\n');
let insideHealLatexFormulas = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.includes('export function healLatexFormulas')) {
    insideHealLatexFormulas = true;
    instrumented += line.replace('export function healLatexFormulas', 'function healLatexFormulas') + '\n';
    continue;
  }
  
  if (insideHealLatexFormulas && line.includes('export function fixMisalignedKaTeX')) {
    break; // end of function
  }
  
  // Skip any other export functions that might be captured (like healInvertedDelimiters, wait, it's defined BEFORE healLatexFormulas usually, but just in case)
  
  instrumented += line + '\n';
  
  if (insideHealLatexFormulas && line.includes('processed =')) {
    instrumented += `if (processed && processed.includes('$$내부')) console.log('$$ appeared at line ${i + 1}: ', processed);\n`;
  }
}

const finalScript = `
  const { healInvertedDelimiters, healCorruptedKatexHtml } = require('./client/src/utils/latexUtils.js');
  
  // Dummy functions to prevent reference errors if they are used but not defined in this snippet
  const htmlTableToMarkdown = (t) => t;
  const wrapMarkdownTables = (t) => t;
  const healMarkdownTable = (t) => t;
  
  ${instrumented}
  
  const text = '특히 $\\sqrt{$ $\\sqrt{\\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';
  healLatexFormulas(text);
`;

fs.writeFileSync('test_exact.js', finalScript);
