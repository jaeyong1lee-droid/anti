const healCorruptedKatexHtml = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text.replace(/\u200b/g, '');
  
  const cleanAndSplitFormula = (formula) => {
    let clean = (formula || '').trim().replace(/\\+/g, '\\').replace(/₩/g, '\\');
    // Decode basic HTML entities inside formula before parsing/splitting
    clean = clean.replace(/&#x27;/g, "'")
                 .replace(/&quot;/g, '"')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&amp;/g, '&');

    clean = balanceMathBraces(clean);
                 
    // Split by any HTML tags (e.g. </div>, <br>, <a/>)
    const parts = clean.split(/(?:<[^>]+?>)/gi);
    return parts.map(p => {
      const trimmed = balanceMathBraces(p.trim());
      if (!trimmed) return '';
      // Math formula check: has math operators/symbols, and is not pure Korean text
      const isMath = /[\+\-\*\/=_\\^]/.test(trimmed) && !/^[가-힣\s.,:;!]+$/.test(trimmed);
      const hasKorean = /[가-힣]/.test(trimmed);
      if (isMath && !hasKorean) {
        return ` __MATH_FORMULA_START__${trimmed}__MATH_FORMULA_END__ `;
      } else {
        return ` ${trimmed} `;
      }
    }).join(' ');
  };

  // 1. Match any annotation block (normal or space-corrupted) and extract formula
  const annotationRegex = /<\s*annotation[a-z]*\b(?:[^"'>]|"[^"]*"|'[^']*')*?>([\s\S]*?)<\s*\/\s*annotation[a-z]*\s*>/gi;
  cleaned = cleaned.replace(annotationRegex, (match, formula) => {
    return cleanAndSplitFormula(formula);
  });
  
  // 1.5. Match any KaTeX error blocks and extract formula from title attribute
  const errorSpanRegex = /<\s*span\b(?:[^"'>]|"[^"]*"|'[^']*')*?\bclass=["'][^"']*\bkatex-error\b[^"']*["'](?:[^"'>]|"[^"]*"|'[^']*')*?>([\s\S]*?)<\s*\/\s*span\s*>/gi;
  cleaned = cleaned.replace(errorSpanRegex, (match, errContent) => {
    const titleMatch = match.match(/title=["']KaTeX error:\s*([\s\S]*?)["']/i);
    if (titleMatch && titleMatch[1]) {
      let msg = titleMatch[1];
      const posIdx = msg.indexOf('at position ');
      if (posIdx !== -1) {
        const colonAfter = msg.indexOf(':', posIdx);
        if (colonAfter !== -1) {
          msg = msg.substring(colonAfter + 1);
        }
      }
      msg = msg.replace(/^\s*\.\.\.\s*/, '');
      msg = balanceMathBraces(msg.trim());
      if (!msg) return '';
      return cleanAndSplitFormula(msg);
    }
    let cleanedErr = balanceMathBraces(errContent.trim());
    if (!cleanedErr) return '';
    return cleanedErr;
  });
  
  // 2. Strip all KaTeX-related HTML tags (allowing space corruption suffixes and prefix spaces)
  // Using quote-safe regex to prevent matching '>' inside attribute values
  const katexTagsRegex = /<\s*\/?\s*(?:div|span|annotation|semantics|math|mrow|msub|msup|mfrac|msqrt|msubsup|mo|mi|mn|mtext|mspace|mstyle|mtd|mtr|mtable)[a-z]*\b(?:[^"'>]|"[^"]*"|'[^']*')*?>/gi;
  cleaned = cleaned.replace(katexTagsRegex, '');
  
  // 3. Restore formula markers with standard dollar signs
  cleaned = cleaned.replace(/__MATH_FORMULA_START__([\s\S]*?)__MATH_FORMULA_END__/g, (match, formula) => {
    return ` $${formula}$ `;
  });
  
  return cleaned;
};

// 3. 메인 레이아웃 및 수식 복구 마스터 함수

module.exports = { healCorruptedKatexHtml };