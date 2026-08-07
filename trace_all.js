const text = '특히 $\\sqrt{$ $\\sqrt{\\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';
let processed = text;
console.log('Original:', processed);

// [Self-Healing] Safely restore corrupted (₩t) or (\t) time interval notation to (${\Delta}t$)
processed = processed.replace(/\([₩\\]?t\)/gi, '($\\Delta t$)');

processed = processed.replace(/₩/g, '\\').replace(/\\\(([\s\S]*?)\\\)/g, (m, p1) => '$' + p1.trim() + '$');

// SKIP healCorruptedKatexHtml since it does not affect this text based on my earlier isolated test
// processed = healCorruptedKatexHtml(processed);

// [Self-Healing] Convert misplaced double dollar ($$) math inside parentheses or sentence flow to single dollar ($) inline math
processed = processed.replace(/\(([^()\n]*?)\$\$\s*([\s\S]*?)\s*\$\$\s*([^()\n]*?)\)/g, '($1 $$$2$$ $3)');
processed = processed.replace(/([([\uAC00-\uD7A3a-zA-Z0-9,])\s*\$\$\s*([^\$\n]+?)\s*\$\$\s*([)\],\.\uAC00-\uD7A3a-zA-Z0-9,])/g, '$1 $$$2$$ $3');
// [Self-Healing] Fix misplaced dollar signs inside parentheses like (s_{\infty}$) -> ($s_{\infty}$)
processed = processed.replace(/\(([^$()\n]+?)\$\)/g, '($$$1$)');

// [Self-Healing] Remove space between backslash and Greek commands (including trailing alphanumeric characters)
const greekSubscriptFullLetters = 'alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa';
const spaceRegex = new RegExp(`\\\\\\s+(${greekSubscriptFullLetters})([a-zA-Z0-9]*)\\b`, 'gi');
processed = processed.replace(spaceRegex, '\\$1$2');

// [Self-Healing] Clean up Greek letter variables missing underscores (e.g. \sigmav -> \sigma_v, \sigma'v -> \sigma'_v)
const greekSubscriptLetters = 'sigma|gamma|tau|theta|alpha|beta|epsilon|phi|psi|omega|mu|nu';
const greekSubscriptRegex = new RegExp(`\\\\(${greekSubscriptLetters})('?)([a-zA-Z0-9])\\b`, 'gi');
processed = processed.replace(greekSubscriptRegex, '\\$1$2_$3');

// [Self-Healing] Remove space between backslash and general math commands
processed = processed.replace(/\\\s+(Delta|Sigma|Gamma|Phi|Theta|Omega|frac|dfrac|tfrac|sqrt|cdot|times|div|pm|infty|partial|sum|int|sim|le|ge|lt|gt|sin|cos|tan|log|ln|nabla|neq|ne|approx)\b/g, '\\$1');

// [Self-Healing] Fix space-corrupted or missing-space Delta variables (e.g. \Deltau, \ Deltau, \Deltasigma)
const greekNames = 'alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa|Delta|Sigma|Gamma|Phi|Theta|Omega';
const deltaGreekRegex = new RegExp(`\\\\\\s*Delta\\s*(${greekNames})\\b`, 'gi');
processed = processed.replace(deltaGreekRegex, '\\Delta \\$1');
processed = processed.replace(/\\\s*Delta\s*([a-zA-Z])\b/gi, '\\Delta $1');

// [Self-Healing] Strip KaTeX-unsupported MathJax \pu{...} commands (renders red in KaTeX)
processed = processed.replace(/\\pu\s*\{([^}]+)\}/gi, '$1');

// [Self-Healing] Fix raw bearing capacity formula gamma terms
processed = processed.replace(/\\?\s*gamma\s*BN\\?\s*gamma/gi, '\\gamma B N_\\gamma').replace(/\\?\s*gamma\s*B\s*N\s*\\?\s*gamma/gi, '\\gamma B N_\\gamma');

// SKIP html blocks
// SKIP healInvertedDelimiters since it does not affect this text based on my earlier isolated test

const greekLetters = 'alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa';
const greekRegex = new RegExp(`(?<!\\\\)\\b(${greekLetters})_?(\\d+)\\b`, 'g');
processed = processed.replace(greekRegex, '\\$1_$2');

processed = processed.replace(/β/g, '\\beta').replace(/α/g, '\\alpha');

processed = processed.replace(/(?<!\\)\b(alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa)\b/g, '\\$1');
processed = processed.replace(/(?<!\\)\b(Delta|Sigma|Gamma|Phi|Theta|Omega)\b/g, '\\$1');

function balanceMathBraces(str) {
  if (!str) return str;
  let o = 0, c = 0;
  for (let ch of str) { if (ch === '{') o++; else if (ch === '}') c++; }
  if (o > c) return str + '}'.repeat(o - c);
  return str;
}
function replaceRoots(str) {
  let p = str;
  p = p.replace(/√(?!\()/g, '\\sqrt ');
  return p;
}
processed = replaceRoots(processed);

processed = processed.replace(/\x0a\s*eq\b/g, '\\neq');

const formatConsecutiveFormulas = (text) => {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split('$');
  if (parts.length < 3) return text;
  let rebuilt = parts[0];
  for (let i = 1; i < parts.length; i += 2) {
    let formula = balanceMathBraces(parts[i]);
    let plainText = parts[i + 1] || '';
    rebuilt += '$' + formula + '$' + plainText;
  }
  return rebuilt;
};
processed = formatConsecutiveFormulas(processed);
console.log('After formatConsecutiveFormulas:', processed);

processed = processed.replace(/(?<=:[^\n]*)\s+([–—−-]\s*(?:\$[^\$]+\$|[a-zA-Z0-9_\\\{\}]+)\s*:)/g, '\n$1');

processed = processed.replace(/\\{2,}([a-zA-Z]+)/g, '\\$1');
processed = processed.replace(/\\{2,}%/g, '\\%');

processed = processed.replace(/(\\quad\s*\\text\{[a-zA-Z]+\}|\b[a-zA-Z]+\b|\b\\text\{[a-zA-Z]+\})\s*\$\$(\s*_[a-zA-Z0-9])/g, '$$$$ $1$2');
processed = processed.replace(/(\\quad\s*\\text\{[a-zA-Z]+\}|\b[a-zA-Z]+\b|\b\\text\{[a-zA-Z]+\})\s*\$(\s*_[a-zA-Z0-9])/g, '$$ $1$2');

processed = processed.replace(/\$\$\s*([\s\S]*?)\s*\$\$\s*(\n*)\s*(kN\/m\\\^2|kN\/m\^2|kN\/m²|kN\/m\\\^3|kN\/m\^3|kN\/m³|t\/m\\\^3|t\/m\^3|t\/m³|kg\/cm\\\^2|kg\/cm\^2|kg\/cm²|kPa|MPa|kN|N|m|cm|mm|m\\\^2|m\^2|m²|m\\\^3|m\^3|m³|g\/cm\\\^3|g\/cm\^3|g\/cm³|kg\/m\\\^3|kg\/m\^3|kg\/m³|%)(?![a-zA-Z0-9가-힣])/gi, '...');

console.log('Final:', processed);
