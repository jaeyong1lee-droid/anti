const { healCorruptedKatexHtml } = require("./testHelper.js");
function healLatexFormulas(text, isNested = false, passedPoissonSymbol = null, forceInline = false) {
  if (!text || typeof text !== 'string') return text;

  // [Self-Healing] Fix spaced-out formatting tags hallucinated by AI
  const formatTags = ['strong', 'em', 'b', 'i', 'u', 'span', 'div', 'p', 'br', 'table', 'tr', 'td', 'th', 'tbody', 'thead'];
  const formatRegex = new RegExp(`(<\\s*\\/?\\s*)(${formatTags.join('|')})\\b(\\s*[^>]*)?>`, 'gi');
  text = text.replace(formatRegex, (match, prefix, tag, suffix) => {
  console.log("After:", `text = text.replace(formatRegex, (match, prefix, tag, suffix) => {`, "->", typeof processed !== "undefined" ? processed : text);
    const isClosing = prefix.includes('/');
    return (isClosing ? '</' : '<') + tag + (suffix ? suffix.trim() : '') + '>';
  });

  text = text.replace(/<\s*\/\s*sub\s*>/gi, '');
  console.log("After:", `text = text.replace(/<\s*\/\s*sub\s*>/gi, '');`, "->", typeof processed !== "undefined" ? processed : text);
  text = text.replace(/\s*<\s*sub\s*>\s*/gi, '_');
  console.log("After:", `text = text.replace(/\s*<\s*sub\s*>\s*/gi, '_');`, "->", typeof processed !== "undefined" ? processed : text);
  text = text.replace(/<\s*\/\s*sup\s*>/gi, '');
  console.log("After:", `text = text.replace(/<\s*\/\s*sup\s*>/gi, '');`, "->", typeof processed !== "undefined" ? processed : text);
  text = text.replace(/\s*<\s*sup\s*>\s*/gi, '^');
  console.log("After:", `text = text.replace(/\s*<\s*sup\s*>\s*/gi, '^');`, "->", typeof processed !== "undefined" ? processed : text);
  text = text.replace(/\([₩\\]?t\)/gi, '($\\Delta t$)');
  console.log("After:", `text = text.replace(/\([₩\\]?t\)/gi, '($\\Delta t$)');`, "->", typeof processed !== "undefined" ? processed : text);

  text = text.replace(/₩/g, '\\').replace(/\\\(([\\s\\S]*?)\\\)/g, (m, p1) => '$' + p1.trim() + '$');
  console.log("After:", `text = text.replace(/₩/g, '\\').replace(/\\\(([\\s\\S]*?)\\\)/g, (m, p1) => '$' + p1.trim() + '$');`, "->", typeof processed !== "undefined" ? processed : text);
  let processed = healCorruptedKatexHtml(text);
  
  processed = processed.replace(/(?<!\$)\$\s+\$(?!\$)/g, ' ');
  console.log("After:", `processed = processed.replace(/(?<!\$)\$\s+\$(?!\$)/g, ' ');`, "->", typeof processed !== "undefined" ? processed : text);
  processed = processed.replace(/\$\s*\\sqrt\{\s*\\sqrt\{\\dots\}\s*\}\s*\$\s*/g, '');
  console.log("After:", `processed = processed.replace(/\$\s*\\sqrt\{\s*\\sqrt\{\\dots\}\s*\}\s*\$\s*/g, '');`, "->", typeof processed !== "undefined" ? processed : text);
  processed = processed.replace(/\(([^()\n]*?)\$\$\s*([\\s\\S]*?)\s*\$\$\s*([^()\n]*?)\)/g, '($1 $$$2$$ $3)');
  console.log("After:", `processed = processed.replace(/\(([^()\n]*?)\$\$\s*([\\s\\S]*?)\s*\$\$\s*([^()\n]*?)\)/g, '($1 $$$2$$ $3)');`, "->", typeof processed !== "undefined" ? processed : text);
  processed = processed.replace(/([([\\uAC00-\\uD7A3a-zA-Z0-9,])\s*\$\$\s*([^\$\n]+?)\s*\$\$\s*([)\],\\.\\uAC00-\\uD7A3a-zA-Z0-9,])/g, '$1 $$$2$$ $3');
  console.log("After:", `processed = processed.replace(/([([\\uAC00-\\uD7A3a-zA-Z0-9,])\s*\$\$\s*([^\$\n]+?)\s*\$\$\s*([)\],\\.\\uAC00-\\uD7A3a-zA-Z0-9,])/g, '$1 $$$2$$ $3');`, "->", typeof processed !== "undefined" ? processed : text);
  processed = processed.replace(/\(([^$()\n]+?)\$\)/g, '($$$1$)');
  console.log("After:", `processed = processed.replace(/\(([^$()\n]+?)\$\)/g, '($$$1$)');`, "->", typeof processed !== "undefined" ? processed : text);

  processed = processed.replace(/&amp;\\?lt;?/gi, '<').replace(/&amp;\\?gt;?/gi, '>');
  console.log("After:", `processed = processed.replace(/&amp;\\?lt;?/gi, '<').replace(/&amp;\\?gt;?/gi, '>');`, "->", typeof processed !== "undefined" ? processed : text);
  processed = processed.replace(/&\\lt;?/gi, '<').replace(/&\\gt;?/gi, '>');
  console.log("After:", `processed = processed.replace(/&\\lt;?/gi, '<').replace(/&\\gt;?/gi, '>');`, "->", typeof processed !== "undefined" ? processed : text);
  processed = processed.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  console.log("After:", `processed = processed.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');`, "->", typeof processed !== "undefined" ? processed : text);
  processed = processed.replace(/\\text\{\s*W유\s*\}m?/gi, '\\mu m').replace(/W유m?/gi, '\\mu m');
  console.log("After:", `processed = processed.replace(/\\text\{\s*W유\s*\}m?/gi, '\\mu m').replace(/W유m?/gi, '\\mu m');`, "->", typeof processed !== "undefined" ? processed : text);

  const greekSubscriptFullLetters = 'alpha|beta|gamma|sigma|tau|phi|theta|epsilon|pi|delta|omega|mu|lambda|psi|rho|eta|nu|xi|zeta|chi|upsilon|kappa';
  const spaceRegex = new RegExp(`\\\\\\s+(${greekSubscriptFullLetters})([a-zA-Z0-9]*)\\b`, 'gi');
  processed = processed.replace(spaceRegex, '\\$1$2');
  console.log("After:", `processed = processed.replace(spaceRegex, '\\$1$2');`, "->", typeof processed !== "undefined" ? processed : text);

  const greekSubscriptLetters = 'sigma|gamma|tau|theta|alpha|beta|epsilon|phi|psi|omega|mu|nu';
  const greekSubscriptRegex = new RegExp(`\\\\(${greekSubscriptLetters})('?)([a-zA-Z0-9])\\b`, 'gi');
  processed = processed.replace(greekSubscriptRegex, '\\$1$2_$3');
  console.log("After:", `processed = processed.replace(greekSubscriptRegex, '\\$1$2_$3');`, "->", typeof processed !== "undefined" ? processed : text);

  const formatConsecutiveFormulas = (text) => {
    if (!text || typeof text !== 'string') return text;
    const parts = text.split('$');
    if (parts.length < 3) return text;
    let rebuilt = parts[0];
    for (let i = 1; i < parts.length; i += 2) {
      let formula = balanceMathBraces(parts[i]);
      let plainText = parts[i + 1] || '';
      rebuilt += '$' + formula + '$' + plainText;
    }
    return rebuilt;
  };
  processed = formatConsecutiveFormulas(processed);
  console.log("After:", `processed = formatConsecutiveFormulas(processed);`, "->", typeof processed !== "undefined" ? processed : text);

  processed = processed.replace(/(\$\s?[^\$]+\s?\$)(은|는|이|가|을|를|의|로|으로|에|에서|와|과|도|만|일때|입니다|라하면|값은)/g, '$1 $2');
  console.log("After:", `processed = processed.replace(/(\$\s?[^\$]+\s?\$)(은|는|이|가|을|를|의|로|으로|에|에서|와|과|도|만|일때|입니다|라하면|값은)/g, '$1 $2');`, "->", typeof processed !== "undefined" ? processed : text);
  processed = processed.replace(/\$?\\[\s*INPUT_(\d+(?:_\d+)?)\s*\\]\$?|\$?\\[\s*INPUT_(\d+(?:_\d+)?)\s*\\]\$?|\$\[\s*INPUT_(\d+(?:_\d+)?)\s*\]\$/gi, '[INPUT_$1]');
  console.log("After:", `processed = processed.replace(/\$?\\[\s*INPUT_(\d+(?:_\d+)?)\s*\\]\$?|\$?\\[\s*INPUT_(\d+(?:_\d+)?)\s*\\]\$?|\$\[\s*INPUT_(\d+(?:_\d+)?)\s*\]\$/gi, '[INPUT_$1]');`, "->", typeof processed !== "undefined" ? processed : text);

  return processed.trim();
}

// 오브젝트 딥 힐러 트리구조

console.log("FINAL:", healLatexFormulas("\\\\nu"));