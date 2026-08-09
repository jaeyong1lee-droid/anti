const simpleVariableRegex = new RegExp(
  // 1. Relations (most specific, e.g. k_h = 10, y(x) = ax + b, z < z_c)
  `\\b[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]]+\\s*(?:[+=<>]|\\s+[-/\\*]\\s+)\\s*[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]]+(?:\\s*(?:[+=<>]|\\s+[-/\\*]\\s+)\\s*[a-zA-Z0-9_'\\^\\(\\)\\{\\}\\[\\]]+)*\\b|` +
  // 2. Function notation (e.g. p(z), w(z))
  `\\b[a-zA-Z]\\([a-zA-Z0-9_'\\s\\\\]+\\)(?![a-zA-Z0-9_'])|` +
  // 3. Subscripted variables with braces or underscores (e.g. s_{t-\\Delta t}, s_{t- \\Delta t}, S_{max}, k_h, z_c)
  `\\\\?[a-zA-Z0-9_']+_{\\s*[^{}\\n]+\\s*}|` +
  `\\b[a-zA-Z0-9]+_[a-zA-Z0-9_']+\\b|` +
  // 4. Constants
  `\\b(?:EI|EA|FS)\\b|` +
  `\\bF\\.S\\.(?![a-zA-Z0-9_'])`,
  'g'
);

const str = 'a=b+c=d+e=f+g=h+i=j+k=l+m=n+o=p+q=r+s=t+u=v+w=x+y=z+'.repeat(10) + '!';
const start = Date.now();
str.replace(simpleVariableRegex, 'X');
console.log('Time ms:', Date.now() - start);
