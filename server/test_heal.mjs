function healLatexFormulas(text) {
  if (!text || typeof text !== 'string') return text;
  
  let processed = text;
  
  // Normalize dashes
  processed = processed.replace(/[–—−]/g, '-');
  
  // Convert Greek letters with numbers (e.g. sigma1, sigma_1 -> \sigma_1)
  const greekLetters = 'alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa';
  const greekRegex = new RegExp(`(?<!\\\\)\\b(${greekLetters})_?(\\d+)\\b`, 'g');
  processed = processed.replace(greekRegex, '\\$1_$2');
  
  const MATH_COMMANDS = [
    'frac', 'dfrac', 'tfrac', 'sqrt', 'cdot', 'times', 'div', 'pm', 'infty', 'partial', 'sum', 'int', 'sim',
    'le', 'ge', 'lt', 'gt', 'sin', 'cos', 'tan', 'log', 'ln', 'nabla', 'neq', 'ne', 'approx',
    'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'nu', 'xi', 'zeta', 'chi', 'upsilon', 'kappa',
    'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
    'rightarrow', 'leftarrow', 'circ', 'deg', 'dot', 'ddot', 'bar', 'hat', 'tilde',
    'quad', 'qquad', 'text', 'left', 'right'
  ];
  
  const formulaRegex = new RegExp(
    `(?:[a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/=.,·][a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/= \\t.,·]*)?` +
    `\\\\(?:${MATH_COMMANDS.join('|')})` +
    `(?![a-zA-Z])` +
    `[a-zA-Z0-9_'\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/= \\t.,<>%\\\\·]*`,
    'g'
  );
  
  processed = processed.replace(formulaRegex, (match) => {
    const trailingSpaces = match.match(/\s*$/)[0];
    const trimmed = match.trim();
    const trailingPunctuation = trimmed.match(/[.,;:!]+$/);
    const punc = trailingPunctuation ? trailingPunctuation[0] : '';
    const formula = trimmed.slice(0, trimmed.length - punc.length).trim();
    return `$${formula}$${punc}${trailingSpaces}`;
  });
  
  return processed;
}

const reason = "자가 제시한 식은 Duncan-Chang 모델의 쌍곡선 관계식인 (sigma1 – sigma3) = \\epsilon/(a + b * \\epsilon) 을 역수 형태로 정확히 표현하고 있으";

console.log("Original:", reason);
console.log("Healed:  ", healLatexFormulas(reason));
