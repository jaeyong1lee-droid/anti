const { healInvertedDelimiters } = require('./client/src/utils/latexUtils.js');
let text = '특히 $\\sqrt{$ $\\sqrt{\\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';

function myHealLatexFormulas(processed) {
  // Line 516
  processed = processed.replace(/\(([^()\n]*?)\$\$\s*([\s\S]*?)\s*\$\$\s*([^()\n]*?)\)/g, '($1 $$$2$$ $3)');
  console.log('After 516:', processed);
  // Line 517
  processed = processed.replace(/([([\uAC00-\uD7A3a-zA-Z0-9,])\s*\$\$\s*([^\$\n]+?)\s*\$\$\s*([)\],\.\uAC00-\uD7A3a-zA-Z0-9,])/g, '$1 $$$2$$ $3');
  console.log('After 517:', processed);
  // Line 519
  processed = processed.replace(/\(([^$()\n]+?)\$\)/g, '($$$1$)');
  console.log('After 519:', processed);

  // Line 594
  // raw katex regex
  // ...
  
  processed = healInvertedDelimiters(processed);
  console.log('After healInvertedDelimiters:', processed);
  
  return processed;
}

myHealLatexFormulas(text);
