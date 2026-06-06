// Self-Healing LaTeX Formula Post-Processor to automatically repair missing backslashes and math delimiters ($...$)

export function tokenizeForHealing(text) {
  const tokens = [];
  let lastIndex = 0;
  const regex = /(\$\$.*?\$\$)|(\$[^\$\n]+?\$)/gs;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const before = text.substring(lastIndex, match.index);
    if (before) {
      tokens.push({ type: 'text', content: before });
    }
    const mathContent = match[0];
    if (mathContent.startsWith('$$')) {
      tokens.push({ type: 'block-math', content: mathContent });
    } else {
      tokens.push({ type: 'inline-math', content: mathContent });
    }
    lastIndex = regex.lastIndex;
  }
  const after = text.substring(lastIndex);
  if (after) {
    tokens.push({ type: 'text', content: after });
  }
  return tokens;
}

export function healLatexFormulas(text) {
  if (!text || typeof text !== 'string') return text;

  // 0. Clean up leaked JSON structures
  let healed = text.replace(/",\s*"[a-zA-Z_0-9]+"\s*:\s*"/g, '\n\n');

  // A. Remove trailing backslashes at the end of lines
  healed = healed.replace(/\\+(\r?\n|$)/g, '$1');

  // B. Preprocess: Remove single newlines inside inline math blocks (avoiding empty lines and Korean)
  healed = healed.replace(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g, (match, content) => {
    if (/[\uAC00-\uD7A3]/.test(content)) return match;
    return `$${content.replace(/\r?\n/g, ' ')}$`;
  });

  // C. K0, K_0, k0 related dollar fixes
  healed = healed.replace(/\$현장의\$K_0\$응력\$/g, '현장의 $K_0$ 응력');
  healed = healed.replace(/\$현장의\$K_0\$/g, '현장의 $K_0$');
  healed = healed.replace(/K_0응력/g, '$K_0$ 응력');
  healed = healed.replace(/([가-힣])([Kk]0|[Kk]_0)/g, '$1 $2');
  healed = healed.replace(/([Kk]0|[Kk]_0)([가-힣])/g, '$1 $2');

  const safeLatexCommands = [
    'frac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
    'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
    'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
    'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
    'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
    'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
    'equiv', 'nabla', 'quad', 'qquad', 'max', 'min'
  ];

  healed = healed.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
    if (safeLatexCommands.includes(p1)) return '\\' + p1;
    return match;
  });

  healed = healed.replace(/\\text\{\s*([가-힣]+)\s*\}/g, ' $1 ');
  healed = healed.replace(/\$([0-9.,]+)([가-힣]+)\$/g, '$1$2');
  healed = healed.replace(/\$([0-9.,]+)\s+([가-힣]+)\$/g, '$1 $2');
  healed = healed.replace(/([가-힣:])(\\[a-zA-Z]+)/g, '$1 $2');
  healed = healed.replace(/([a-zA-Z0-9_])\$(\})/g, '$1$2$');
  healed = healed.replace(/\$(\})/g, '$1$');
  healed = healed.replace(/\$([가-힣]{1,10})\$/g, '$1');
  healed = healed.replace(/\$\$([^$]+?)\$\$/g, (match, content) => {
    if (/[\uAC00-\uD7A3]/.test(content)) return content;
    return match;
  });
  healed = healed.replace(/\$([^$]+?)\$/g, (match, content) => {
    if (/[\uAC00-\uD7A3]/.test(content)) return content;
    return match;
  });

  // D. Fix missing backslashes for common greek letters and math symbols
  const mathWords = [
    'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
    'frac', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 'tan', 'approx', 'partial', 'le', 'ge', 'lt', 'gt'
  ];
  
  mathWords.forEach(word => {
    const regex = new RegExp(`(?<!\\\\)\\b${word}\\b`, 'g');
    healed = healed.replace(regex, `\\${word}`);
  });

  // Special fix: "le0.602" -> "\le 0.602" or similar
  healed = healed.replace(/(?<!\\)\b(le|ge|lt|gt|sigma|tau|gamma|alpha|phi|psi|beta|delta|theta)(\d+)/g, '\\$1 $2');

  // E. First pass: Match full math expressions (excluding newlines)
  healed = healed.replace(/([a-zA-Z0-9_\-\+\*\/()\[\]\{\} \t=<>\\.,\^·~]+)/g, (match) => {
    const trimmed = match.trim();
    if (!trimmed) return match;
    if (trimmed.startsWith('$')) return match;
    if (/^[a-zA-Z0-9\s]+$/.test(trimmed)) return match;
    const hasMathIndicator = /[\\[\]{}_^=<>+\-*\/]/.test(trimmed);
    if (hasMathIndicator) {
      return ` $${trimmed}$ `;
    }
    return match;
  });

  // F. Fallback math-line wrapping
  const lines = healed.split('\n');
  const processedLines = lines.map(line => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('\\frac') || trimmedLine.startsWith('\\partial') || trimmedLine.startsWith('T_v') || trimmedLine.startsWith('c_v')) {
      if (!/[\uAC00-\uD7A3]/.test(trimmedLine) && !trimmedLine.startsWith('$')) {
        return `$${trimmedLine}$`;
      }
    }
    return line;
  });
  healed = processedLines.join('\n');

  // G. Tokenize to separate existing math (including newly wrapped equations) from plain text
  const tokens = tokenizeForHealing(healed);

  const processed = tokens.map(token => {
    if (token.type !== 'text') {
      let math = token.content;
      math = math.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
      return math;
    }

    let t = token.content;

    // H. Match standalone variables like c_v, T_v, m_v, H_d, u, z, t, k, etc.
    const varPattern = /(?<![a-zA-Z0-9_\\\$])\b(u|t|z|k|e|c|p|q|d|H_d|c_v|T_v|m_v|E|I|P_0|K_0|K_a|K_p|N_c|N_q|N_\\gamma|F\.S\.)\b(?![a-zA-Z0-9_\$])/g;
    t = t.replace(varPattern, (match, p1) => '$' + p1 + '$');

    // I. Formatting: Fix spacing after numbers for lists
    t = t.replace(/(\b\d+\.)([^\s\d])/g, '$1 $2');

    return t;
  });

  let joined = processed.join('');

  joined = joined.replace(/([가-힣a-zA-Z0-9\.\,])(\$)/g, '$1 $2');
  joined = joined.replace(/(\$)([가-힣a-zA-Z0-9])/g, '$1 $2');

  joined = joined.replace(/[ \t]+/g, ' '); // collapse only horizontal spaces, not newlines
  joined = joined.replace(/\n{3,}/g, '\n\n'); // limit to max 2 newlines
  joined = joined.replace(/\$\$\$+/g, '$$');
  joined = joined.replace(/\$\$[ \t]*\$\$/g, '');
  joined = joined.replace(/\$[ \t]*\$/g, '');

  joined = joined.replace(/\$\$([^\$\n]+?)\$(?!\$)/g, (match, p1) => {
    if (/[\uAC00-\uD7A3]/.test(p1)) return match;
    return '$' + p1 + '$';
  });
  joined = joined.replace(/(?<!\$)\$([^\$\n]+?)\$\$/g, (match, p1) => {
    if (/[\uAC00-\uD7A3]/.test(p1)) return match;
    return '$' + p1 + '$';
  });

  joined = joined.replace(/(^\s*[•\-*\u2022]\s*[^\n]+)\n\s*\n(?=\s*[•\-*\u2022]\s*)/gm, '$1\n');

  return joined;
}
