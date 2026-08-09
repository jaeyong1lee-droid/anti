const MATH_COMMANDS = [
  'frac', 'dfrac', 'tfrac', 'sqrt', 'cdot', 'times', 'div', 'pm', 'infty', 'partial', 'sum', 'int', 'sim',
  'le', 'ge', 'lt', 'gt', 'sin', 'cos', 'tan', 'log', 'ln', 'nabla', 'neq', 'ne', 'approx',
  'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'nu', 'xi', 'zeta', 'chi', 'upsilon', 'kappa',
  'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
  'rightarrow', 'leftarrow', 'circ', 'deg', 'dot', 'ddot', 'bar', 'hat', 'tilde',
  'quad', 'qquad', 'text', 'left', 'right'
];

const formulaRegex = new RegExp(
  `(?:[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/=.,·][a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/= \\t.,·]*)?` +
  `\\\\(?:${MATH_COMMANDS.join('|')})` +
  `(?![a-zA-Z])` +
  `[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]\\+\\-\\*\\/= \\t.,<>%\\\\·]*`,
  'g'
);

const text = "q_u = 1.3cN_c + qN_q + 0.4\\gamma BN_\\gamma *** 원형기초(Circular Footing) ** : q_u = 1";
const match = text.match(formulaRegex);
console.log("Match:", match);

const replaced = text.replace(formulaRegex, (m) => `[MATCH_START]${m}[MATCH_END]`);
console.log("Replaced:", replaced);
