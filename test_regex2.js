let text1 = '특히 $\\sqrt{$ $\\sqrt{\\dots}$ $}$ 내부의 분모';
let text2 = '$$A$$ $$B$$';
let text3 = '$x$ $y$';

const mergeRegex = /(?<!\\\$)\\\$\s+\\\$(?!\\\$)/g;
// Wait, in JS the regex is just /(?<!\$)\$\s+\$(?!\$)/g
const jsRegex = /(?<!\$)\$\s+\$(?!\$)/g;

console.log(text1.replace(jsRegex, ' '));
console.log(text2.replace(jsRegex, ' '));
console.log(text3.replace(jsRegex, ' '));
