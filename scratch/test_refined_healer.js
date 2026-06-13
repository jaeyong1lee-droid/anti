const text = `두께가 dz 이고 가로·세로가 각각 dx , dy 인 미소 포화 흙 요소를 고려합니다. 이 요소의 총 체적 V 는 다음과 같습니다.
V = dxdydz z 방향의 흐름만 존재하므로, 하부에서 유입되는 유속을 v_z 라고 하면 미소 요소 하부로 들어오는 유입 유량 q_{in} 은 다음과 같습니다. $q_{in} = v_z dx dy$요소의 두께 dz 를 통과하여 상부로 유출되는 유속은 테일러 급수 (Taylor Series) 의 1 차 항까지 고려하여 v_z + \\frac{\\partial v_z}{\\partial z} dz 로 나타낼 수 있습니다. 따라서 유출 유량 q_{out} 은 다음과 같습니다.$ q_{out} = (v_z + \\frac{\\partial v_z}{\\partial z} dz) dxdy 미소 시간 dt 동안 흙 요소 내부에 남아있는 물의 체적 변화량 dV_w 는 유입 유량과 유출 유량의 차이에 시간을 곱한 것입니다. dV_w = (q_{in} - q_{out})dt = - \\frac{\\partial v_z}{\\partial z} dxdydzdt 단계 2.2: 토립자 골격의 체적 변화율과 간극비의 관계 흙 입자와 물이 비압축성이므로, 유출된 물의 부피 dV_w 는 흙 요소의 전체 체적 감소량 dV 와 완벽히 일치해야 합니다. dV_w = dV 흙의 전체 체적 V 는 흙 입자 체적 V_s 와 초기 간극비 e_0 를 사용하여 다음과 같이 표현할 수 있습니다. V = V_s(1 + e_0) \\Longrightarrow V_s = \\frac{V}{1+e_0} = \\frac{dxdydz}{1+e_0} 압밀이 진행되는 동안 흙 입자의 체적 V_s 는 변하지 않으므로, 체적 변화량 dV 는 오직 간극비의 변화량 de 에 의해서만 결정됩니다. dV = V_s de = \\frac{dxdydz}{1+e_0}de 이를 미소 시간 dt 에 대한 변화율로 나타내면 다음과 같습니다. \\frac{\\partial V}{\\partial t} = \\frac{dxdydz}{1+e_0} \\frac{\\partial e}{\\partial t} $단계 2.1에서 유도한 물의 유출 변화율 \\frac{\\partial V_w}{\\partial t} = - \\frac{\\partial v_z}{\\partial z} dx dy dz 와 연립하면 다음의 관계식을 얻습니다.$ - \\frac{\\partial v_z}{\\partial z} dxdydz = \\frac{dxdydz}{1+e_0} \\frac{\\partial e}{\\partial t} 양변에서 미소 요소의 부피 dx dy dz 를 소거하면 연속방정식이 완성됩니다. - \\frac{\\partial v_z}{\\partial z} = \\frac{1}{1+e_0} \\frac{\\partial e}{\\partial t} 단계 2.3: Darcy 의 법칙 적용 Darcy 의 법칙에 의해 유출 속도 v_z 는 다음과 같습니다. v_z = ki = k (- \\frac{\\partial h}{\\partial z} ) $이때 수두 h 는 위치수두와 압력수두의 합으로 표현되며, 압밀 중 발생하는 수두 차이는 전적으로 과잉간극수압 u 의 변화량에 지배됩니다. 따라서 h = \\frac{u}{\\gamma_w} 로 나타낼 수 있습니다. (여기서 \\gamma_w 는 물의 단위중량입니다.)$ v_z = - \\frac{k}{\\gamma_w} \\frac{\\partial u}{\\partial z} 이를 앞서 구한 연속방정식의 좌변에 대입하여 z 에 대해 한 번 더 미분하면 다음과 같습니다. - \\frac{\\partial v_z}{\\partial z} = \\frac{k}{\\gamma_w} \\frac{\\partial^2 u}{\\partial z^2} 따라서, 흐름과 체적 변화의 관계식은 다음과 같이 정리됩니다. \\frac{k}{\\gamma_w} \\frac{\\partial^2 u}{\\partial z^2} = \\frac{1}{1+e_0} \\frac{\\partial e}{\\partial t} $단계 2.4: 유효응력 원리 및 체적변화계수의 도입 테르자기의 유효응력 원리에 따르면 전응력 \\sigma 는 유효응력 \\sigma' 와 과잉간극수압 u 의 합입니다.$ \\sigma = \\sigma' + u $일정한 하중이 재하된 상태이므로 전응력의 변화량은 0 입니다. (d\\sigma = 0) 따라서 다음이 성립합니다.$ d\\sigma' = -du 유효응력의 증가에 따른 간극비의 감소 비율을 압축계수 a_v 라고 하며, 다음과 같이 정의됩니다. a_v = - \\frac{de}{d\\sigma'} \\Longrightarrow de = -a_v d\\sigma' = a_v du 이를 시간 t 에 대해 미분하면 다음과 같습니다. \\frac{\\partial e}{\\partial t} = a_v \\frac{\\partial u}{\\partial t} 이 식을 단계 2.3의 최종 관계식 우변에 대입합니다. \\frac{k}{\\gamma_w} \\frac{\\partial^2 u}{\\partial z^2} = \\frac{a_v}{1+e_0} \\frac{\\partial u}{\\partial t} 여기서 흙의 단위 체적당 부피 변화 비율을 나타내는 체적변화계수 m_v 는 다음과 같이 정의됩니다. m_v = \\frac{a_v}{1+e_0} 이를 대입하면 다음과 같은 형태를 얻습니다. \\frac{k}{\\gamma_w} \\frac{\\partial^2 u}{\\partial z^2} = m_v \\frac{\\partial u}{\\partial t} \\Longrightarrow \\frac{\\partial u}{\\partial t} = \\left(\\frac{k}{m_v \\gamma_w}\\right) \\frac{\\partial^2 u}{\\partial z^2} 단계 2.5: 압밀계수의 정의와 최종 방정식 마지막으로, 압밀의 진행 속도를 결정하는 물리적 정수인 압밀계수 C_v 를 다음과 같이 정의합니다. C_v = \\frac{k}{m_v \\gamma_w} 이 물리 상수를 대입하면 최종적인 테르자기의 1 차 압밀방정식이 유도됩니다. \\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2} $3. 유도 결과의 물리적 의미 열전도 방정식과의 유사성: 이 방정식은 물리학 및 수학에서 널리 알려진 열전도 방정식 (Heat Equation) 또는 확산 방정식 (Diffusion Equation) 과 완전히 동일한 수학적 구조를 가집니다. 즉, 열이 고온에서 저온으로 확산되듯 과잉간극수압 u 도 높은 곳에서 낮은 곳 (배수 경계면) 으로 소산 (diffusion) 되는 과정을 묘사합니다. 시간에 따른 변화: 임의의 깊이에서 과잉간극수압의 시간당 감소율 \\frac{\\partial u}{\\partial t} 은 수압 경사의 변화율 \\frac{\\partial^2 u}{\\partial z^2} 에 비례합니다. 압밀계수 C_v 의 영향: C_v 의 값이 클수록 과잉간극수압의 소산 속도가 빨라지므로 압밀 침하가 빠르게 종료됩니다. 투수성이 좋을수록 (k 가 클수록), 흙이 덜 압축될수록 (m_v 가 작을수록) C_v$ 는 커집니다.`;

function tokenizeForHealing(text) {
  const tokens = [];
  let lastIndex = 0;
  // Crucial: do not let inline-math cross newlines [^\$\n]
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

function healLatexFormulas(text) {
  if (!text) return text;

  // 1. Remove outer dollars if the block contains Korean characters (with or without backslashes)
  // This allows inner formulas to be matched and wrapped individually by formulaPattern/mathExprPattern
  text = text.replace(/\$\$([^$]+?)\$\$/g, (match, content) => {
    if (/[\uAC00-\uD7A3]/.test(content)) {
      return content;
    }
    return match;
  });
  text = text.replace(/\$([^$]+?)\$/g, (match, content) => {
    if (/[\uAC00-\uD7A3]/.test(content)) {
      return content;
    }
    return match;
  });

  // 문장 중에 깨져서 들어오거나 뒤섞인 K0 관련 예외 처리
  text = text.replace(/\$현장의\$K_0\$응력\$/g, '현장의 $K_0$ 응력');
  text = text.replace(/\$현장의\$K_0\$/g, '현장의 $K_0$');
  text = text.replace(/K_0응력/g, '$K_0$ 응력');
  text = text.replace(/([가-힣])([Kk]0|[Kk]_0)/g, '$1 $2');
  text = text.replace(/([Kk]0|[Kk]_0)([가-힣])/g, '$1 $2');

  const safeLatexCommands = [
    'frac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
    'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
    'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
    'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
    'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
    'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
    'equiv', 'nabla', 'quad', 'qquad', 'max', 'min'
  ];
  if (text) {
    text = text.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
      if (safeLatexCommands.includes(p1)) return '\\' + p1;
      return match;
    });

    text = text.replace(/\\text\{\s*([가-힣]+)\s*\}/g, ' $1 ');
    text = text.replace(/\$([0-9.,]+)([가-힣]+)\$/g, '$1$2');
    text = text.replace(/\$([0-9.,]+)\s+([가-힣]+)\$/g, '$1 $2');
    text = text.replace(/([가-힣:])(\\[a-zA-Z]+)/g, '$1 $2');
    text = text.replace(/([a-zA-Z0-9_])\$([\}]+)/g, '$1$2$');
    text = text.replace(/\$([\}]+)/g, '$1$');
  }
  if (!text) return text;
  
  let trimmed = text.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    trimmed = trimmed.substring(2, trimmed.length - 2).trim();
  } else if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }

  const hasMathIndicators = /\\(sigma|tau|alpha|beta|gamma|phi|theta|epsilon|pi|delta|Delta|omega|mu|lambda|psi|rho|eta|frac|sqrt|cdot|mathrm|text|log|Sigma|Gamma|Phi|Theta|Omega)\b/.test(trimmed) || 
                            /[_^{<>=]/.test(trimmed);
  const hasKorean = /[\uAC00-\uD7A3]/.test(trimmed);

  if (hasMathIndicators && !hasKorean && trimmed.length < 150) {
    const cleanedMath = trimmed.replace(/\$/g, '');
    return '$' + cleanedMath + '$';
  }
  
  const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'];
  let healed = text;
  if (hasKorean && ((text.trim().startsWith('$$') && text.trim().endsWith('$$')) || (text.trim().startsWith('$') && text.trim().endsWith('$')))) {
    healed = trimmed;
  }

  const lines = healed.split('\n');
  const processedLines = lines.map(line => {
    const dollarCount = (line.match(/\$/g) || []).length;
    const isFormulaLine = /^[\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}\(\)\[\],.\\\\/]*?[<>=]+/.test(line);
    if (dollarCount === 1) {
      if (isFormulaLine) {
        return line.replace(/\$/g, '');
      }
    }
    return line;
  });
  healed = processedLines.join('\n');

  healed = healed.replace(/(\r?\n|^)(\\?[a-zA-Z_']+[a-zA-Z0-9_'\s=\-+\*\/{}\(\)\[\],.\\\\/]*?)\$([^$\n]*?)\$/g, (match, start, p1, p2) => {
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

  let tokens = tokenizeForHealing(healed);
  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;

      // STEP 1: Wrap larger formulas (equations containing =, <, >)
      const formulaPattern = /((?:[\\a-zA-Z0-9_\-\+\(\{\[\'][a-zA-Z_0-9'\{\}\[\]\(\)\+\-\*\/\.\\\\/ \t\^]*(?:_[a-zA-Z0-9{}]+)?[ \t]*[<>=]+[ \t]*[a-zA-Z0-9'_ \t\-+\/{}\(\)\[\],.\\\\/<>=:;!?^~&|%]*[a-zA-Z0-9'\)\}]))/g;
      t = t.replace(formulaPattern, (match, g1) => {
        if (g1) {
          const hasBackslash = g1.includes('\\');
          const hasGreek = symbols.some(sym => g1.includes(sym));
          const hasMathContext = /[<>=]/.test(g1) && (hasBackslash || hasGreek || /\b[cuq]\b/.test(g1));
          if (hasBackslash || hasGreek || hasMathContext) {
            const isComplex = g1.includes('\\frac') || g1.includes('\\log') || g1.length > 40;
            return isComplex ? '$$' + g1.trim() + '$$' : '$' + g1.trim() + '$';
          }
        }
        return match;
      });

      // STEP 2: Match and wrap math expressions containing LaTeX commands or greek letters even without =, <, >
      const mathExprPattern = /((?:\b[a-zA-Z0-9_\-\+\*\/\(\)\[\] \t=<>]*)?\\[a-zA-Z_]+(?:[a-zA-Z0-9_\-\+\*\/\(\)\[\ ']|[ \t=<>\\\\\^]|\{[^}]*\})*)/g;
      t = t.replace(mathExprPattern, (match, g1) => {
        if (g1) {
          const isComplex = g1.includes('\\frac') || g1.includes('\\partial') || g1.length > 40;
          return isComplex ? '$$' + g1.trim() + '$$' : '$' + g1.trim() + '$';
        }
        return match;
      });

      t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');
      t = t.replace(/(\\sigma'\s*=\s*\\sigma\s*-\s*u)/g, (match, p1) => '$' + p1 + '$');
      t = t.replace(/(\\sigma\s*-\s*P_w)/g, (match, p1) => '$' + p1 + '$');

      token.content = t;
    }
  });

  let reassembledAfterStep1 = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembledAfterStep1);

  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      t = t.replace(/\(([^)$]*?(?:\\gamma|\\sigma|\\theta|\\phi|\\alpha|\\beta|\\frac|\\delta|\\Delta|_[a-zA-Z0-9{])[^)$]*?)\)/g, (match, p1) => {
        if (p1.includes('\\left') || p1.includes('\\right')) {
          return match;
        }
        if (/[\uAC00-\uD7A3]/.test(p1)) {
          return match;
        }
        return '($' + p1.trim() + '$)';
      });
      token.content = t;
    }
  });

  let reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);

  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;

      const mathWords = [
        'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
        'frac', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 'tan', 'approx', 'partial'
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

      token.content = t;
    }
  });

  reassembled = tokens.map(t => t.content).join('');
  tokens = tokenizeForHealing(reassembled);

  tokens.forEach(token => {
    if (token.type !== 'text') {
      let inside = token.content;
      const isBlock = inside.startsWith('$$');
      let math = isBlock 
        ? inside.substring(2, inside.length - 2).trim()
        : inside.substring(1, inside.length - 1).trim();

      math = math.replace(/\by_([a-zA-Z0-9]+)\b/g, '\\gamma_$1');
      math = math.replace(/\by\s*D_f\b/g, '\\gamma D_f');
      math = math.replace(/\byD_f\b/g, '\\gamma D_f');
      math = math.replace(/\by\s*\\?cdot\b/g, '\\gamma \\cdot');

      const safeLatexCommands = [
        'frac', 'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 
        'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 
        'Phi', 'Theta', 'Omega', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 
        'tan', 'approx', 'partial', 'text', 'left', 'right', 'begin', 'end', 'sum', 'int',
        'textbf', 'textit', 'underline', 'pm', 'mp', 'neq', 'geq', 'leq', 'to', 'leftarrow',
        'rightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'infty', 'propto',
        'equiv', 'nabla', 'quad', 'qquad', 'max', 'min'
      ];
      math = math.replace(/\\\\([a-zA-Z]+)/g, (match, p1) => {
        if (safeLatexCommands.includes(p1)) return '\\' + p1;
        return match;
      });

      token.content = isBlock ? '$$' + math + '$$' : '$' + math + '$';
    }
  });

  reassembled = tokens.map(t => t.content).join('');

  const finalTokens = tokenizeForHealing(reassembled);

  finalTokens.forEach(token => {
    if (token.type === 'inline-math') {
      let inside = token.content.substring(1, token.content.length - 1).trim();
      inside = inside.replace(/\r?\n/g, ' ').trim();
      token.content = '$' + inside + '$';
    } else if (token.type === 'block-math') {
      const inside = token.content.substring(2, token.content.length - 2).trim();
      token.content = '$$' + inside + '$$';
    }
  });

  reassembled = finalTokens.map(t => t.content).join('');
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
      if (lastChar && !/\s/.test(lastChar)) {
        if (!/[\(\[\{\'\"]/.test(lastChar)) {
          needSpace = true;
        }
      }
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && current.type === 'text') {
      const firstChar = current.content[0];
      if (firstChar && !/\s/.test(firstChar)) {
        if (!/[\)\]\}\'\"]/.test(firstChar)) {
          needSpace = true;
        }
      }
    } else if ((prev.type === 'inline-math' || prev.type === 'block-math') && (current.type === 'inline-math' || current.type === 'block-math')) {
      needSpace = true;
    }

    if (needSpace) {
      result += ' ' + current.content;
    } else {
      result += current.content;
    }
  }

  result = result.replace(/\$\$\$(\$?)/g, (match, p1) => '$$' + p1);
  result = result.replace(/\$\$([^\$]+?)\$(?!\$)/g, (match, p1) => '$' + p1 + '$');
  result = result.replace(/(?<!\$)\$([^\$]+?)\$\$/g, (match, p1) => '$' + p1 + '$');

  return result;
}

console.log("HEALED OUTPUT:");
console.log(healLatexFormulas(text));
