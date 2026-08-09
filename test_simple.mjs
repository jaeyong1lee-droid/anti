const simpleVariableRegex = new RegExp(
  `\\b[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]]+\\s*(?:[+=<>]|\\s+[-/\\*]\\s+)\\s*[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]]+(?:\\s*(?:[+=<>]|\\s+[-/\\*]\\s+)\\s*[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]]+)*\\b|` +
  `\\b[a-zA-Z]\\([a-zA-Z0-9_']+\\)(?![a-zA-Z0-9_'])|` +
  `\\\\?[a-zA-Z0-9_']+_\\{\\s*[^{}\\n]+\\s*\\}|` +
  `\\b[a-zA-Z0-9]+_[a-zA-Z0-9_']+\\b|` +
  `\\b(?:EI|EA|FS)\\b|` +
  `\\bF\\.S\\.(?![a-zA-Z0-9_'])`,
  'g'
);

const text = "원형기초(Circular Footing) ** : q_u = 1";
const replaced = text.replace(simpleVariableRegex, (m) => `[MATCH]${m}[/MATCH]`);
console.log("Replaced:", replaced);
