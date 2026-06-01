// Surgical patch: protects rule 5 (the double-backslash cleaner) in healLatexFormulas
// by applying it only to text tokens instead of the full raw text.
// This prevents $$\sum_{m=0}^\infty ... \\$$ multi-line blocks from being corrupted.

const fs = require('fs');
const filePath = 'server/index.js';
let content = fs.readFileSync(filePath, 'utf8');

// The exact target line (with \r\n ending as confirmed from inspection)
const OLD_LINE = "  // 5. Clean up multiple backslashes ONLY when they are part of a command name (e.g. \\\\gamma -> \\gamma)\r\n  // This preserves standard LaTeX newlines like \\\\\r\n  healed = healed.replace(/\\\\\\\\([a-zA-Z]+)/g, '\\\\$1');\r\n";

const NEW_LINE = "  // 5. Clean up double-backslash command names - applied only on TEXT segments to preserve \\\\  inside valid math blocks\r\n  {\r\n    const rule5Tokens = tokenizeForHealing(healed);\r\n    healed = rule5Tokens.map(tok => {\r\n      if (tok.type !== 'text') return tok.content;\r\n      return tok.content.replace(/\\\\\\\\([a-zA-Z]+)/g, '\\\\$1');\r\n    }).join('');\r\n  }\r\n";

if (!content.includes(OLD_LINE)) {
  console.error('Target line not found! Dumping nearby context to debug:');
  const idx = content.indexOf('Clean up multiple backslashes');
  if (idx !== -1) {
    console.log(JSON.stringify(content.substring(idx - 2, idx + 180)));
  }
  process.exit(1);
}

const patched = content.replace(OLD_LINE, NEW_LINE);
fs.writeFileSync(filePath, patched, 'utf8');
console.log('SUCCESS: Rule 5 safely wrapped in tokenize-protect block.');
