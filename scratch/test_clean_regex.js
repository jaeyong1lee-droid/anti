const testCases = [
  {
    name: "Poisson ratio bounds",
    text: "포아송비 u 의 물리적 한계는 -1 <= u <= 0.5 이다."
  },
  {
    name: "Naked inequalities",
    text: "만약 a < b 이고 c > d 이면"
  },
  {
    name: "Inequality inside math block",
    text: "수식 $u < 0$ 이고 $u = 0.5$ 이다."
  },
  {
    name: "Corrupted div tags",
    text: "변형률\\< divstyle = \"height : 0.8rem;\" \\> \\< /div \\> 이다."
  },
  {
    name: "Corrupted MathML close tags",
    text: "값은 u < /annotation \\> \\< /semantics \\> \\< /math \\> 이다."
  },
  {
    name: "Corrupted spanclass attributes",
    text: "텍스트 \\< spanclass = \"katex - html\" aria - hidden = \"true\" \\> u"
  },
  {
    name: "Corrupted strut styling",
    text: "\\< spanclass = \"strut\" style = \"height : 0.8056cm; vertical - align : -0.0556em;\" \\> u"
  }
];

function healLatexFormulasSafe(text) {
  if (!text || typeof text !== 'string') return text;

  let processed = text.replace(/\\{2,}([a-zA-Z]+)/g, '\\$1');

  // SAFE COMPACT CLEANING LAYER:
  processed = processed
    .replace(/<br\s*\/?>/gi, '\n\n')
    .replace(/<div[^>]*>\s*[•*]?\s*([^<]+?)\s*<\/div>/gi, '\n\n* $1')
    // 1. Remove standard whitelisted HTML/MathML tags (both normal and backslash-escaped)
    .replace(/\\?<\s*\/?\s*(?:div|p|span|li|ul|ol|annotation|semantics|math|strut|mord|class|style|br|mrow|msup|msub|mn|mi|mo)\b[^>]*>/gi, '')
    // 2. Remove attribute assignments with double/single quotes
    .replace(/(?:style|class|span\s*class|spanclass|div\s*style|divstyle|div\s*class|divclass|xmlns|aria\s*-\s*hidden)\s*=\s*["'][^"']*["']/gi, '')
    // 3. Remove attribute assignments without quotes
    .replace(/(?:style|class|span\s*class|spanclass|div\s*style|divstyle|div\s*class|divclass|xmlns|aria\s*-\s*hidden)\s*=\s*[^>\s]*/gi, '')
    // 4. Remove loose backslash-escaped brackets (\\< or \\>) and tag-like residues (preserving naked math < and >)
    .replace(/\\<|\\>|\/?(?:div|p|span|li|ul|ol|annotation|semantics|math|strut|mord)\s*\\?>/gi, '')
    .replace(/(?<!\$)\b(?:divstyle|divclass|spanclass)\b/gi, '')
    .replace(/\n{3,}/g, '\n\n');

  return processed;
}

testCases.forEach(tc => {
  console.log(`\n--- Test: ${tc.name} ---`);
  console.log("Input:  ", JSON.stringify(tc.text));
  console.log("Output: ", JSON.stringify(healLatexFormulasSafe(tc.text)));
});
