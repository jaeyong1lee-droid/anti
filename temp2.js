const W = `[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]]+`;
const OP_ANY = `(?:[+=<>]|\\s+[-/\\*]\\s+)`;
const OP_MAND = `[+=<>]`;
const regexStr = `\\b${W}\\s*(?:${OP_ANY}\\s*${W}\\s*)*${OP_MAND}\\s*${W}(?:\\s*${OP_ANY}\\s*${W})*\\b`;
const regex = new RegExp(regexStr, 'g');

const testCases = [
  'c = a - b',
  'a - b = c',
  'A - B',
  'A + B',
  'CIEGEOS) - Wikipedia',
  'y(x) = ax + b',
  'z < z_c'
];

testCases.forEach(t => {
  const match = t.match(regex);
  console.log(t, '=>', match);
});
