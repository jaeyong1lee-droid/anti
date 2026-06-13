import { tokenizeForHealing, healBackslashes, cleanCorruptedFormula } from '../client/src/utils/latexUtils.js';

function healLatexFormulasRefined(text) {
  if (!text) return text;
  if (typeof text !== 'string') return text;

  // [신규 전처리 1] HTML 가공
  text = text.replace(/<br\s*\/?>/gi, '\n\n');
  text = text.replace(/<div[^>]*>\s*•?\s*([^<]+?)\s*<\/div>/gi, '\n\n* $1');

  // [신규 전처리 3-1] Misplaced variable dollar early conversion (e.g. u$: -> $u$: or N_d$: -> $N_d$:)
  // 변수명 뒤에 $가 단독으로 오고 그 뒤에 콜론, 스페이스, 개행 등이 있을 때, 누락된 앞의 $를 보충하여 $변수명$ 형태로 만듭니다.
  text = text.replace(/(?<!\$)\b([a-zA-Z_][a-zA-Z0-9_]*)\$(?=:|\s|\n|$)/g, (match, p1) => '$' + p1 + '$');

  // [신규 전처리 2] 글머리 기호(*)가 전방 문자와 공백 없이 강제 밀착된 케이스(*k:, *H: 등) 탐지 및 리스트 격리 개행
  text = text.replace(/([^\n\s])\s*\*+\s*([a-zA-Z0-9_\uAC00-\uD7A3\$]+:)/g, '$1\n\n* $2');

  // 0. Hashtag commands 복구
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
  text = text.replace(hashRegex, '\\$1');

  text = cleanCorruptedFormula(text);

  // 1. 엔티티 복구
  text = text.replace(/&#x27;/g, "'")
             .replace(/&quot;/g, '"')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&amp;/g, '&');
  
  // 2. 리스트 줄바꿈
  text = text.replace(/([\.?!\)\]\}])\s*\*\s*(?=[\uAC00-\uD7A3])/g, '$1\n\n* ');

  const safeLatexCommands = [
    'frac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
    'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
    'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
    'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
    'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
    'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
    'equiv', 'nabla', 'quad', 'qquad', 'max', 'min',
    'sim', 'le', 'ge', 'div', 'sec', 'cosec', 'cot', 'lt', 'gt'
  ];
  
  text = text.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
    if (safeLatexCommands.includes(p1)) return '\\' + p1;
    return match;
  });

  // [신규 추가] standalone 라인 수식 중 unclosed dollar 치유 및 디스플레이 수식(display math) 승격
  const lines = text.split('\n');
  const healedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('$') && !trimmed.startsWith('$$')) {
      const dollarCount = (trimmed.match(/\$/g) || []).length;
      if (dollarCount === 1) {
        return '$$' + line.substring(line.indexOf('$') + 1) + '$$';
      }
    } else if (trimmed.startsWith('$$')) {
      const dollarCount = (trimmed.match(/\$\$/g) || []).length;
      if (dollarCount === 1) {
        return line + '$$';
      }
    }
    return line;
  });
  text = healedLines.join('\n');

  // 3. 수식 블록 내부 백슬래시 복원
  {
    const tokens = tokenizeForHealing(text);
    text = tokens.map(token => {
      let content = token.content;
      if (token.type === 'text') {
        content = healBackslashes(content, false);
      } else {
        const isBlock = content.startsWith('$$');
        const math = isBlock ? content.substring(2, content.length - 2) : content.substring(1, content.length - 1);
        let healedMath = healBackslashes(math, true);
        
        healedMath = healedMath.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        healedMath = healedMath.replace(/\\(dfrac|frac)\s*\{\s*/g, '\\$1{')
                               .replace(/\s*\}\s*\{\s*/g, '}{')
                               .replace(/\s*\}\s*$/g, '}');
                               
        content = isBlock ? `$$${healedMath}$$` : `$${healedMath}$`;
      }
      return content;
    }).join('');
  }
  
  let trimmed = text.trim();
  const startsWithDollar = trimmed.startsWith('$');
  const endsWithDollar = trimmed.endsWith('$');
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    trimmed = trimmed.substring(2, trimmed.length - 2).trim();
  } else if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }

  const hasMathIndicators = /\\(sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|Delta|omega|mu|lambda|psi|rho|eta|frac|sqrt|cdot|mathrm|text|log|Sigma|Gamma|Phi|Theta|Omega)\b/.test(trimmed) || 
                            /[_^{<>=]/.test(trimmed);
  const hasKorean = /[\uAC00-\uD7A3]/.test(trimmed);

  if (startsWithDollar && endsWithDollar && hasMathIndicators && !hasKorean && trimmed.length < 150) {
    let cleanedMath = trimmed.replace(/\$/g, '');
    cleanedMath = cleanedMath.replace(/~/g, '\\sim ');
    cleanedMath = cleanedMath.replace(/(?<!\\)\bsim\b/gi, '\\sim');
    cleanedMath = cleanedMath.replace(/(\d+\.?\d*)\s+(\d+\.?\d*)/g, '$1 \\sim $2');
    return `$$${cleanedMath}$$`; // display math로 통일성 확보
  }
  
  const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'];
  let healed = text;
  if (hasKorean && ((text.trim().startsWith('$$') && text.trim().endsWith('$$')) || (text.trim().startsWith('$') && text.trim().endsWith('$')))) {
    const isRealFormula = /\\/.test(trimmed) || /_/.test(trimmed) || /\^/.test(trimmed) || /[=+\-\*\/]/.test(trimmed) || /\\cdot/.test(trimmed);
    if (!isRealFormula) {
      healed = trimmed;
    }
  }

  const lines2 = healed.split('\n');
  const processedLines = lines2.map(line => {
    const dollarCount = (line.match(/\$/g) || []).length;
    const isFormulaLine = /^[\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}\(\)\[\],.\\\\/]*?[<>=]+/.test(line);
    if (dollarCount === 1 && isFormulaLine) {
      return line.replace(/\$/g, '');
    }
    return line;
  });
  healed = processedLines.join('\n');

  healed = healed.replace(/(\r?\n|^)(\\?[a-zA-Z_']+[a-zA-Z0-9_'\-+\*\/\{\}\(\)\[\]\.\\\\/]*?)\$([^$\n]*?)\$/g, (match, start, p1, p2) => {
    const hasBackslash = p1.includes('\\') || p2.includes('\\');
    const hasGreek = symbols.some(sym => p1.includes(sym) || p2.includes(sym));
    if (hasBackslash || hasGreek) {
      return start + '$' + p1 + p2 + '$';
    }
    return match;
  });

  healed = healed.replace(/\\frac\s*\{\s*\$([^\$]+?)\}/g, '\\frac{$1}');
  healed = healed.replace(/\{\s*\$([^\$]+?)\s*\}/g, '{$1}');
  healed = healed.replace(/(\d+)\s*\$\s*([\/+\-*])\s*(\d+)/g, '$1$2$3');

  {
    const rule5Tokens = tokenizeForHealing(healed);
    healed = rule5Tokens.map(tok => {
      if (tok.type !== 'text') return tok.content;
      return tok.content.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
    }).join('');
  }

  const runOnTextOnly = (txt, fn) => {
    if (!txt) return '';
    const parts = txt.split(/(<[^>]+>)/g);
    return parts.map(part => {
      if (part.startsWith('<') && part.endsWith('>')) return part;
      return fn(part);
    }).join('');
  };

  let tokens = tokenizeForHealing(healed);
  tokens.forEach(token => {
    if (token.type === 'text') {
      token.content = runOnTextOnly(token.content, (t) => {
        // [중요 교정] formulaPattern에서 '*' 기호를 제거하여 마크다운 리스트 기호가 math delimiter($)에 무단으로 말려들어가는 현상 방지
        const formulaPattern = /([a-zA-Z0-9_\-\+\/()\[\]\{\} \t=<>\\.,\^·~']+)/g;
        t = t.replace(formulaPattern, (match) => {
          const trimmedMatch = match.trim();
          if (!trimmedMatch) return match;
          if (trimmedMatch.startsWith('$')) return match;
          if (/^[a-zA-Z0-9\s]+$/.test(trimmedMatch)) return match;
          
          const hasBackslash = trimmedMatch.includes('\\');
          const hasGreek = symbols.some(sym => trimmedMatch.includes(sym));
          const hasMathContext = /[=<>+\/]/.test(trimmedMatch) || /_[a-zA-Z0-9{}]/.test(trimmedMatch) || /\^/.test(trimmedMatch) || /\s-\s/.test(trimmedMatch);
          
          if (hasBackslash || hasGreek || hasMathContext) {
            // dfrac 혹은 frac가 포함되어 있거나 길이가 긴 경우 display math $$로 감싸고, 그렇지 않으면 $로 감쌈
            const isComplex = trimmedMatch.includes('\\frac') || trimmedMatch.includes('\\dfrac') || trimmedMatch.includes('\\log') || trimmedMatch.length > 40;
            return isComplex ? `$$${trimmedMatch}$$` : `$${trimmedMatch}$`;
          }
          return match;
        });

        t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
        t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*u)/g, (match, p1) => '$' + p1 + '$');
        t = t.replace(/(\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
        return t;
      });
    }
  });

  let reassembledAfterStep1 = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembledAfterStep1);

  tokens.forEach(token => {
    if (token.type === 'text') {
      token.content = runOnTextOnly(token.content, (t) => {
        return t.replace(/\(([^)$]*?(?:\\gamma|\\sigma|\\theta|\\phi|\\alpha|\\beta|\\frac|\\dfrac|\\delta|\\Delta|_[a-zA-Z0-9{])[^)$]*?)\)/g, (match, p1) => {
          if (p1.includes('\\left') || p1.includes('\\right')) return match;
          return '($' + p1.trim() + '$)';
        });
      });
    }
  });

  let reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);
  tokens.forEach(token => {
    if (token.type === 'text') {
      token.content = runOnTextOnly(token.content, (t) => {
        const mathWords = [
          'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
          'frac', 'dfrac', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 'tan', 'approx', 'partial'
        ];
        mathWords.forEach(word => {
          const regex = new RegExp(`(?<!\\\\)\\b${word}\\b`, 'g');
          t = t.replace(regex, `\\${word}`);
        });

        const wrapAllowedWords = [
          'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'
        ];
        const subscriptPattern = `(?:_[a-zA-Z0-9]+|_(?:\\{[a-zA-Z0-9_]+\\}))?`;
        const greekPattern = new RegExp(`(\\\\\\b(?:${wrapAllowedWords.join('|')})${subscriptPattern}(?![a-zA-Z0-9_]))`, 'g');
        t = t.replace(greekPattern, (match, p1) => '$' + p1 + '$');

        const plainSubscriptPattern = /((\b[a-zA-Z](?:_[a-zA-Z0-9]+|_(?:\{[a-zA-Z0-9_]+\}))(?![a-zA-Z0-9_])))/g;
        t = t.replace(plainSubscriptPattern, (match, p1) => '$' + p1 + '$');
        return t;
      });
    }
  });

  reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);
  tokens.forEach(token => {
    if (token.type !== 'text') {
      let inside = token.content;
      const isBlock = inside.startsWith('$$');
      let math = isBlock ? inside.substring(2, inside.length - 2).trim() : inside.substring(1, inside.length - 1).trim();
      math = math.replace(/\by_([a-zA-Z0-9]+)\b/g, '\\gamma_$1');
      math = math.replace(/\by\s*D_f\b/g, '\\gamma D_f');
      math = math.replace(/\byD_f\b/g, '\\gamma D_f');
      math = math.replace(/\by\s*\\?cdot\b/g, '\\gamma \\cdot');
      
      math = math.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
        if (safeLatexCommands.includes(p1)) return '\\' + p1;
        return match;
      });
      token.content = isBlock ? `$$${math}$$` : `$${math}$`;
    }
  });

  reassembled = tokens.map(t => t.content).join('');
  const finalTokens = tokenizeForHealing(reassembled);

  finalTokens.forEach(token => {
    if (token.type === 'inline-math') {
      let math = token.content.substring(1, token.content.length - 1).trim();
      math = math.replace(/~/g, '\\sim ');
      math = math.replace(/(?<!\\)\bsim\b/gi, '\\sim');
      math = math.replace(/(\d+\.?\d*)\s+(\d+\.?\d*)/g, '$1 \\sim $2');
      math = math.replace(/(?<![a-zA-Z\\])u\b/g, '\\nu');
      token.content = `$${math}$`;
    } else if (token.type === 'block-math') {
      let math = token.content.substring(2, token.content.length - 2).trim();
      math = math.replace(/~/g, '\\sim ');
      math = math.replace(/(?<!\\)\bsim\b/gi, '\\sim');
      math = math.replace(/(\d+\.?\d*)\s+(\d+\.?\d*)/g, '$1 \\sim $2');
      math = math.replace(/(?<![a-zA-Z\\])u\b/g, '\\nu');
      token.content = `$$${math}$$`;
    } else if (token.type === 'text') {
      token.content = token.content.replace(/(?<!\\)\bsim\b/gi, '~');
    }
  });

  reassembled = finalTokens.map(t => t.content).join('');

  // [중요 교정] 리스트 아이템 글머리 바로 다음에 정의되는 단독 변수명/식별자를 $변수명$ 형태로 안전하게 치환 (예: "* K_0 : 정지토압계수" -> "* $K_0$ : 정지토압계수")
  reassembled = reassembled.replace(/(^\s*\*+\s*)([a-zA-Z0-9_]+(?:_[a-zA-Z0-9]+)?)(?=\s*:)/gm, (match, bullet, name) => {
    if (name.startsWith('$') || name.endsWith('$')) return match;
    return bullet + '$' + name + '$';
  });
  
  // 가독성을 위한 수식 기호 앞뒤 공백 조정
  reassembled = reassembled.replace(/([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])([\(\[\{])/g, '$1 $2');
  reassembled = reassembled.replace(/([\)\]\}])([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9])/g, '$1 $2');

  const processedTokens = tokenizeForHealing(reassembled);
  let result = '';
  for (let i = 0; i < processedTokens.length; i++) {
    const current = processedTokens[i];
    if (i === 0) {
      result += current.content;
      continue;
    }
    const prev = processedTokens[i - 1];
    let needSpace = false;

    if (prev.type === 'text' && (current.type === 'inline-math' || current.type === 'block-math')) {
      const lastChar = prev.content[prev.content.length - 1];
      if (lastChar && !/\s/.test(lastChar) && !/[\(\[\{\'\"]/.test(lastChar)) needSpace = true;
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && current.type === 'text') {
      const firstChar = current.content[0];
      if (firstChar && !/\s/.test(firstChar) && !/[\,\.\?\!\)\]\}\:\;\*]/.test(firstChar)) needSpace = true;
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && (current.type === 'inline-math' || current.type === 'block-math')) {
      needSpace = true;
    }

    result += needSpace ? ' ' + current.content : current.content;
  }

  // [신규 추가] 수식 끝 조사 결합 개선: 수식 뒤에 바로 조사가 오면 스페이스 한칸 띄기
  result = result.replace(/(\$[^\$]+?\$)(은|는|이|가|을|를|의|로|으로|에|에서|와|과|도|만)/g, '$1 $2');

  return result;
}

const text1 = `$K_0 = #dfrac{ u}{1 - u}\n\n* K_0 : 정지토압계수(Coefficientofearthpressureatrest)*\n\nu$: 흙의 포아송 비 (Poisson's ratio of soil)`;
const text2 = `$Q = k #cdot H #cdot #dfrac{N_f}{N_d}\n\n* Q : 단위폭당침투유량*k: 흙의 투수계수\n\n* H : 상.하류측의전수두차*N_d$: 등수두선 낙차 수`;

console.log("=== Text 1 (Refined) ===");
console.log(healLatexFormulasRefined(text1));
console.log("\n=== Text 2 (Refined) ===");
console.log(healLatexFormulasRefined(text2));
