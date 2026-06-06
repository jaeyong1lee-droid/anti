const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'server', 'index.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update LOCAL_FORMULA_DICTIONARY mv term
// Use RegExp to match CP949 or UTF-8 characters flexibly
const targetDicRegex = /-\s*\$m_v\$:\s*체적변화계수\s*\(Coefficient of Volume Compressibility\)/;
if (targetDicRegex.test(content)) {
  content = content.replace(targetDicRegex, `- $m_v$: 체적압축계수(체적변화계수) (Coefficient of Volume Compressibility)`);
  console.log("Success: Replaced dictionary mv term");
} else {
  console.error("Could not find dictionary mv term in index.js");
}

// 2. Replace filterStructureLines function
const startIdx = content.indexOf('function filterStructureLines(mathContent,');
if (startIdx === -1) {
  console.error("Could not find start of filterStructureLines in server/index.js");
  process.exit(1);
}

// Find matching closing brace of filterStructureLines
let braceCount = 0;
let endIdx = -1;
for (let i = startIdx; i < content.length; i++) {
  if (content[i] === '{') {
    braceCount++;
  } else if (content[i] === '}') {
    braceCount--;
    if (braceCount === 0) {
      endIdx = i;
      break;
    }
  }
}

if (endIdx === -1) {
  console.error("Could not find matching end brace for filterStructureLines");
  process.exit(1);
}

const newFilterFuncCode = `function filterStructureLines(mathContent, structure, extraAllowed = []) {
  if (!structure) return '';
  
  const layoutCommands = [
    '\\\\frac', '\\\\sqrt', '\\\\left', '\\\\right', '\\\\times', '\\\\cdot',
    '\\\\partial', '\\\\sin', '\\\\cos', '\\\\tan', '\\\\log', '\\\\ln',
    '\\\\text', '\\\\operatorname', '\\\\mathrm', '\\\\mathbf', '\\\\over', '\\\\choose',
    '\\\\quad', '\\\\qquad', '\\\\;', '\\\\:', '\\\\,', '\\\\!', '\\\\begin', '\\\\end', '\\\\array'
  ];
  let cleanedFormula = mathContent;
  for (const cmd of layoutCommands) {
    cleanedFormula = cleanedFormula.split(cmd).join(' ');
  }

  // C_v 압밀계수 감지 시 k, m_v, gamma_w 도 허용 처리
  const lowerContent = mathContent.toLowerCase();
  if (lowerContent.includes('c_v') || lowerContent.includes('c_{v}')) {
    cleanedFormula += ' k m_v gamma_w';
  }
  // K_a, K_p 토압계수 및 p_a 주동토압 감지 시 c, gamma, z, q 도 허용 처리
  if (lowerContent.includes('k_a') || lowerContent.includes('k_{a}') || lowerContent.includes('k_p') || lowerContent.includes('k_{p}') || lowerContent.includes('p_a')) {
    cleanedFormula += ' c gamma z q';
  }
  // k_h 수평지반반력계수 감지 시 E_0, N 도 허용 처리
  if (lowerContent.includes('k_h') || lowerContent.includes('k_{h}')) {
    cleanedFormula += ' e_0 n e';
  }

  const tokenRegex = /[a-zA-Z0-9_]+/g;
  const formulaTokens = cleanedFormula.match(tokenRegex) || [];
  
  const normalize = (v) => {
    if (!v) return '';
    return v
      .replace(/[\\$\\s\\{\\}\\[\\]\\(\\)]/g, '')
      .replace(/\\\\/g, '')
      .replace(/_/g, '');
  };

  const formulaTokenSet = new Set(formulaTokens.map(t => normalize(t)).filter(Boolean));
  if (extraAllowed && Array.isArray(extraAllowed)) {
    extraAllowed.forEach(word => {
      formulaTokenSet.add(normalize(word));
    });
  }

  const lines = structure.split('\\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    
    if (/^\\s*[\\-\\*\\d\\.]/.test(trimmed)) {
      const colonIdx = trimmed.indexOf(':');
      const dashIdx = trimmed.indexOf('-', 1);
      const sepIdx = colonIdx !== -1 ? colonIdx : dashIdx;
      
      if (sepIdx !== -1) {
        const symbolPortion = trimmed.substring(0, sepIdx);
        const symbolTokens = symbolPortion.match(tokenRegex) || [];
        const normalizedSymbols = symbolTokens.map(s => normalize(s)).filter(Boolean);
        
        if (normalizedSymbols.length === 0) return true;
        
        const hasMatch = normalizedSymbols.some(s => formulaTokenSet.has(s));
        return hasMatch;
      }
    }
    return true;
  });

  return filteredLines.join('\\n').trim();
}`;

content = content.substring(0, startIdx) + newFilterFuncCode + content.substring(endIdx + 1);
console.log("Success: Replaced filterStructureLines function body");

// 3. Replace calls in suggest-title endpoint using flexible regex that ignores line endings
const call1Regex = /\/\/\s*Apply\s*strict\s*filter\r?\n\s*structure\s*=\s*filterStructureLines\(\s*mathContent\s*,\s*structure\s*\);/;
const replacementCall1 = `// Apply strict filter with extra allowed variables from the local match if available
        const extraAllowed = [];
        if (bestLocalMatch) {
          extraAllowed.push(...bestLocalMatch.keywords);
          const symbolTokens = bestLocalMatch.structure.match(/\\$([^\\$]+?)\\$/g) || [];
          symbolTokens.forEach(sym => {
            extraAllowed.push(sym.replace(/\\$/g, ''));
          });
        }
        structure = filterStructureLines(mathContent, structure, extraAllowed);`;

if (call1Regex.test(content)) {
  content = content.replace(call1Regex, replacementCall1);
  console.log("Success: Replaced first filterStructureLines call");
} else {
  console.error("Could not find first filterStructureLines call in server/index.js");
}

const call2Regex = /let\s*fallbackStructure\s*=\s*bestLocalMatch\s*\?\s*bestLocalMatch\.structure\s*:\s*extractVariablesFromMath\(\s*mathContent\s*\);\r?\n\s*fallbackStructure\s*=\s*filterStructureLines\(\s*mathContent\s*,\s*fallbackStructure\s*\);/;
const replacementCall2 = `let fallbackStructure = bestLocalMatch ? bestLocalMatch.structure : extractVariablesFromMath(mathContent);
        const extraAllowed2 = [];
        if (bestLocalMatch) {
          extraAllowed2.push(...bestLocalMatch.keywords);
          const symbolTokens = bestLocalMatch.structure.match(/\\$([^\\$]+?)\\$/g) || [];
          symbolTokens.forEach(sym => {
            extraAllowed2.push(sym.replace(/\\$/g, ''));
          });
        }
        fallbackStructure = filterStructureLines(mathContent, fallbackStructure, extraAllowed2);`;

if (call2Regex.test(content)) {
  content = content.replace(call2Regex, replacementCall2);
  console.log("Success: Replaced second filterStructureLines call");
} else {
  console.error("Could not find second filterStructureLines call in server/index.js");
}

const call3Regex = /let\s*fallbackStructure\s*=\s*bestLocalMatch\s*\?\s*bestLocalMatch\.structure\s*:\s*extractVariablesFromMath\(\s*mathContent\s*\);\r?\n\s*fallbackStructure\s*=\s*filterStructureLines\(\s*mathContent\s*,\s*fallbackStructure\s*\);\r?\n\s*res\.json\(\{\r?\n\s*title:\s*healLatexFormulas\(fallbackTitle\),/;
const replacementCall3 = `let fallbackStructure = bestLocalMatch ? bestLocalMatch.structure : extractVariablesFromMath(mathContent);
      const extraAllowed3 = [];
      if (bestLocalMatch) {
        extraAllowed3.push(...bestLocalMatch.keywords);
        const symbolTokens = bestLocalMatch.structure.match(/\\$([^\\$]+?)\\$/g) || [];
        symbolTokens.forEach(sym => {
          extraAllowed3.push(sym.replace(/\\$/g, ''));
        });
      }
      fallbackStructure = filterStructureLines(mathContent, fallbackStructure, extraAllowed3);
      res.json({
        title: healLatexFormulas(fallbackTitle),`;

if (call3Regex.test(content)) {
  content = content.replace(call3Regex, replacementCall3);
  console.log("Success: Replaced third filterStructureLines call");
} else {
  console.error("Could not find third filterStructureLines call in server/index.js");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("All server index.js modifications written successfully!");
