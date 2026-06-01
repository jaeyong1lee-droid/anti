// Patch script: replaces the unsafe pre-processing block in healLatexFormulas
// with a safe token-protected version that does NOT corrupt valid $$...$$ blocks.
const fs = require('fs');

const filePath = 'server/index.js';
const content = fs.readFileSync(filePath, 'utf8');

// The exact original block to replace (lines 3953-4002 using \r\n endings)
const OLD_BLOCK = `  // --- Pre-processing: Clean up syntax errors and fragmented dollars ---\r
\r
  // 1. Line-by-line recovery for formulas with a single missing delimiter\r
  // If a line starts with a formula variable/command and an equals sign, but has exactly one dollar sign,\r
  // we strip the single dollar sign so that the formulaPattern can wrap the whole equation cleanly.\r
  const lines = healed.split('\\n');\r
  const processedLines = lines.map(line => {\r
    const dollarCount = (line.match(/\\$/g) || []).length;\r
    const isFormulaLine = /^[\\\\?[a-zA-Z_']+[a-zA-Z0-9_'\\s=\\-+\\*\\/{}\\(\\)\\[\\],.\\\\\\\\/]*?[<>=]+/.test(line);\r
    if (dollarCount === 1) {\r
      if (isFormulaLine) {\r
        return line.replace(/\\$/g, '');\r
      }\r
    }\r
    return line;\r
  });\r
  healed = processedLines.join('\\n');\r
\r
  // 2. Repair formulas starting with LaTeX commands but having fragmented dollars mid-way and at the end\r
  // e.g. \\theta = \\frac{$\\delta}{L}$ -> $\\theta = \\frac{\\delta}{L}$\r
  // e.g. \\theta = 1$/300$ -> $\\theta = 1/300$\r
  healed = healed.replace(/(\\r?\\n|^)(\\\\?[a-zA-Z_']+[a-zA-Z0-9_'\\s=\\-+\\*\\/{}\\(\\)\\[\\],.\\\\\\\\/]*?)\\$([^$\\n]*?)\\$/g, (match, start, p1, p2) => {\r
    const hasBackslash = p1.includes('\\\\') || p2.includes('\\\\');\r
    const hasGreek = symbols.some(sym => p1.includes(sym) || p2.includes(sym));\r
    if (hasBackslash || hasGreek) {\r
      return start + '$' + p1 + p2 + '$';\r
    }\r
    return match;\r
  });\r
\r
  // 3. Clean up split fractions in curly braces like \\frac{$\\delta}{L} -> \\frac{\\delta}{L}\r
  healed = healed.replace(/\\\\frac\\s*\\{\\s*\\$([^\\$]+?)\\}/g, '\\\\frac{$1}');\r
  healed = healed.replace(/\\{\\s*\\$([^\\$]+?)\\s*\\}/g, '{$1}');\r
\r
  // 4. Clean up arithmetic split dollars like 1$/300$ -> 1/300$\r
  healed = healed.replace(/(\\d+)\\s*\\$\\s*([\\/+\\-*])\\s*(\\d+)/g, '$1$2$3');\r
\r
  // 5. Clean up multiple backslashes ONLY when they are part of a command name (e.g. \\\\gamma -> \\gamma)\r
  // This preserves standard LaTeX newlines like \\\\\r
  healed = healed.replace(/\\\\\\\\([a-zA-Z]+)/g, '\\\\$1');\r
\r
  // 6. Wrap parenthesized expressions that contain LaTeX commands/Greek variables but lack delimiters\r
  // e.g. (0.5 \\gamma B N_{\\gamma}) -> ( $0.5 \\gamma B N_{\\gamma}$ )\r
  healed = healed.replace(/\\(([^)$]*?(?:\\\\gamma|\\\\sigma|\\\\theta|\\\\phi|\\\\alpha|\\\\beta|\\\\frac|\\\\delta|_[a-zA-Z0-9{])[^)$]*?)\\)/g, (match, p1) => {\r
    if (p1.includes('\\\\left') || p1.includes('\\\\right')) {\r
      return match;\r
    }\r
    return '($' + p1.trim() + '$)';\r
  });\r
`;

const NEW_BLOCK = `  // --- Pre-processing: Apply fixes ONLY on text tokens to protect valid math blocks ---\r
  // Tokenize first so existing $$...$$ and $...$ blocks are NEVER touched by pre-processing.\r
  {\r
    const preTokens = tokenizeForHealing(healed);\r
    const processedParts = preTokens.map(token => {\r
      if (token.type !== 'text') return token.content; // math blocks pass through untouched\r
\r
      let t = token.content;\r
\r
      // 1. Line-by-line recovery: strip lone dollar sign on formula-looking lines\r
      const tLines = t.split('\\n');\r
      const processed = tLines.map(line => {\r
        const dollarCount = (line.match(/\\$/g) || []).length;\r
        const isFormulaLine = /^[\\\\?[a-zA-Z_']+[a-zA-Z0-9_'\\s=\\-+\\*\\/{}\\(\\)\\[\\],.\\\\\\\\/]*?[<>=]+/.test(line);\r
        if (dollarCount === 1 && isFormulaLine) {\r
          return line.replace(/\\$/g, '');\r
        }\r
        return line;\r
      });\r
      t = processed.join('\\n');\r
\r
      // 2. Repair fragmented dollar signs mid-formula\r
      t = t.replace(/(\\r?\\n|^)(\\\\?[a-zA-Z_']+[a-zA-Z0-9_'\\s=\\-+\\*\\/{}\\(\\)\\[\\],.\\\\\\\\/]*?)\\$([^$\\n]*?)\\$/g, (match, start, p1, p2) => {\r
        const hasBackslash = p1.includes('\\\\') || p2.includes('\\\\');\r
        const hasGreek = symbols.some(sym => p1.includes(sym) || p2.includes(sym));\r
        if (hasBackslash || hasGreek) {\r
          return start + '$' + p1 + p2 + '$';\r
        }\r
        return match;\r
      });\r
\r
      // 3. Clean up split fractions: \\frac{$\\delta}{L} -> \\frac{\\delta}{L}\r
      t = t.replace(/\\\\frac\\s*\\{\\s*\\$([^\\$]+?)\\}/g, '\\\\frac{$1}');\r
      t = t.replace(/\\{\\s*\\$([^\\$]+?)\\s*\\}/g, '{$1}');\r
\r
      // 4. Clean up arithmetic split dollars: 1$/300$ -> 1/300\r
      t = t.replace(/(\\d+)\\s*\\$\\s*([\\/+\\-*])\\s*(\\d+)/g, '$1$2$3');\r
\r
      // 5. Clean up double-backslash command names in text (e.g. \\\\gamma -> \\gamma)\r
      // Safe here because we are NOT inside a math block token.\r
      t = t.replace(/\\\\\\\\([a-zA-Z]+)/g, '\\\\$1');\r
\r
      // 6. Wrap parenthesized LaTeX expressions lacking delimiters\r
      t = t.replace(/\\(([^)$]*?(?:\\\\gamma|\\\\sigma|\\\\theta|\\\\phi|\\\\alpha|\\\\beta|\\\\frac|\\\\delta|_[a-zA-Z0-9{])[^)$]*?)\\)/g, (match, p1) => {\r
        if (p1.includes('\\\\left') || p1.includes('\\\\right')) {\r
          return match;\r
        }\r
        return '($' + p1.trim() + '$)';\r
      });\r
\r
      return t;\r
    });\r
    healed = processedParts.join('');\r
  }\r
`;

if (!content.includes(OLD_BLOCK)) {
  console.error('ERROR: Target block not found! No changes made.');
  process.exit(1);
}

const patched = content.replace(OLD_BLOCK, NEW_BLOCK);
fs.writeFileSync(filePath, patched, 'utf8');
console.log('SUCCESS: healLatexFormulas pre-processing safely patched to protect existing math blocks.');
