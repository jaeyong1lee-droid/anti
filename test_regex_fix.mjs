const formulaRegex = new RegExp(
  `(?:[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/=.,·][a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/= \\t.,·]*)?` +
  `\\\\(?:gamma|sigma)` + // simplified for test
  `(?![a-zA-Z])` +
  `[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/= \\t.,<>%\\\\·]*`,
  'g'
);

let t = "q_u = 1.3cN_c + qN_q + 0.4\\gamma BN_\\gamma *** 원형기초";
t = t.replace(formulaRegex, (match) => {
  const trailingSpaces = match.match(/\s*$/)[0];
  const trimmed = match.trim();
  const trailingPunctuation = trimmed.match(/[.,;:!]+$/);
  const punc = trailingPunctuation ? trailingPunctuation[0] : '';
  let formula = trimmed.slice(0, trimmed.length - punc.length).trim();
  
  let trailingAsterisks = '';
  const asteriskMatch = formula.match(/(\*+)$/);
  if (asteriskMatch) {
    trailingAsterisks = asteriskMatch[1];
    formula = formula.slice(0, formula.length - trailingAsterisks.length).trim();
  }
  
  return `$${formula}$${trailingAsterisks}${punc}${trailingSpaces}`;
});

console.log(t);
