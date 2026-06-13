const str = '<span style="color:#cc0000">#dfrac{u}{1-u} #frac{1}{2} #nu</span>';
console.log("INPUT:", str);

const commandsToConvert = [
  'frac', 'dfrac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
  'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
  'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
  'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
  'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
  'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
  'equiv', 'nabla', 'quad', 'qquad', 'max', 'min',
  'sim', 'le', 'ge', 'div', 'sec', 'cosec', 'cot', 'lt', 'gt', 'nu'
];
const hashRegex = new RegExp(`#(${commandsToConvert.join('|')})\\b`, 'g');

const result = str.replace(hashRegex, '\\$1');
console.log("OUTPUT:", result);
