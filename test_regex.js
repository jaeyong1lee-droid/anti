const formulaRegex = new RegExp(
  \(?:[a-zA-Z0-9_'\^\\\\(\\\\)\\\\{\\\\}\\\\[\\\\]\\\\+\\\\-\\\\*\\\\/=.,·][a-zA-Z0-9_'\^\\\\(\\\\)\\\\{\\\\}\\\\[\\\\]\\\\+\\\\-\\\\*\\\\/= \\\\t.,·]*)?\ +
  \\\\\\\\\(?:(?:frac|dfrac|tfrac|sqrt|cdot|times|div|pm|infty|partial|sum|int|sim|le|ge|lt|gt|sin|cos|tan|log|ln|nabla|neq|ne|approx|sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa|Delta|Sigma|Gamma|Phi|Theta|Omega|rightarrow|leftarrow|circ|deg|dot|ddot|bar|hat|tilde|quad|qquad|text|left|right))\ +
  \(?![a-zA-Z])\ +
  \[a-zA-Z0-9_'\^\\\\(\\\\)\\\\{\\\\}\\\\[\\\\]\\\\+\\\\-\\\\*\\\\/= \\\\t.,<>%\\\\\\\\·]*\,
  'g'
);
const simpleVariableRegex = new RegExp(
  \\\\\b[a-zA-Z0-9_'\^\\\\(\\\\)\\\\{\\\\}\\\\[\\\\]]+\\\\s*(?:[+=<>]|\\\\s+[-/\\\\*]\\\\s+)\\\\s*[a-zA-Z0-9_'\^\\\\(\\\\)\\\\{\\\\}\\\\[\\\\]]+(?:\\\\s*(?:[+=<>]|\\\\s+[-/\\\\*]\\\\s+)\\\\s*[a-zA-Z0-9_'\^\\\\(\\\\)\\\\{\\\\}\\\\[\\\\]]+)*\\\\b|\ +
  \\\\\b[a-zA-Z]\\\\([a-zA-Z0-9_']+\\\\)(?![a-zA-Z0-9_'])|\ +
  \\\\\\\\\?[a-zA-Z0-9_']+_\{\\\\s*[^{}\\\\n]+\\\\s*\\\\}|\ +
  \\\\\b[a-zA-Z0-9]+_[a-zA-Z0-9_']+\\\\b|\ +
  \\\\\b(?:EI|EA|FS)\\\\b|\ +
  \\\\\bF\\\\.S\\\\.(?![a-zA-Z0-9_'])\,
  'g'
);
let t1 = 'S(\\\\Delta t)';
let t2 = '\\\\dfrac{t}{S(\\\\Delta t)}';
let t3 = '임계하중(P_{cr}) 산정';

console.log('--- formulaRegex ---');
console.log('t1:', t1.replace(formulaRegex, m => '<<' + m + '>>'));
console.log('t2:', t2.replace(formulaRegex, m => '<<' + m + '>>'));
console.log('t3:', t3.replace(formulaRegex, m => '<<' + m + '>>'));

console.log('--- simpleVariableRegex ---');
console.log('t3:', t3.replace(simpleVariableRegex, m => '<<' + m + '>>'));
