const MATH_COMMANDS = ['dfrac', 'text'];
const formulaRegex = new RegExp(
  `(?:[a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/=.,·][a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/= \\t.,·]*)?` +
  `\\\\(?:${MATH_COMMANDS.join('|')})` +
  `(?![a-zA-Z])` +
  `[a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/= \\t.,<>%\\\\·]*`,
  'g'
);
const input = 'K = \\dfrac{\\text{ 하중 }}{\\text{ 침하량}}';
const result = input.replace(formulaRegex, match => `$${match}$`);
console.log('Original:', input);
console.log('Regex Match Output:', result);
