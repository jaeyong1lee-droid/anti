const text = '특히 $\\sqrt{$ $\\sqrt{\\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';
console.log('0:', text);

let p = text;

// 516
p = p.replace(/\(([^()\n]*?)\$\$\s*([\s\S]*?)\s*\$\$\s*([^()\n]*?)\)/g, '($1 $$$2$$ $3)');
console.log('516:', p);
// 517
p = p.replace(/([([\uAC00-\uD7A3a-zA-Z0-9,])\s*\$\$\s*([^\$\n]+?)\s*\$\$\s*([)\],\.\uAC00-\uD7A3a-zA-Z0-9,])/g, '$1 $$$2$$ $3');
console.log('517:', p);
// 519
p = p.replace(/\(([^$()\n]+?)\$\)/g, '($$$1$)');
console.log('519:', p);

// 600 healInvertedDelimiters
function healInvertedDelimiters(text) {
  if (!text || typeof text !== 'string') return text;

  const parts = text.split('$');
  if (parts.length < 3) return text;

  let evenFormulaCount = 0;
  let oddPlainCount = 0;

  const isFormulaFragment = (part) => {
    return /[\+\-\*\/=_\^\\]/.test(part) && /[a-zA-Z0-9]/.test(part);
  };
  const hasKorean = (part) => {
    return /[가-힣]/.test(part);
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    const hasFormulaCommands = isFormulaFragment(part);
    const hasKoreanChars = hasKorean(part);

    if (i % 2 === 0) {
      if (hasFormulaCommands && !hasKoreanChars) {
        evenFormulaCount++;
      }
    } else {
      if (!hasFormulaCommands && hasKoreanChars) {
        oddPlainCount++;
      }
    }
  }

  if (evenFormulaCount > 0 && oddPlainCount > 0 && evenFormulaCount >= oddPlainCount) {
    return parts.join('$$');
  }

  return text;
}

p = healInvertedDelimiters(p);
console.log('healInvertedDelimiters:', p);
