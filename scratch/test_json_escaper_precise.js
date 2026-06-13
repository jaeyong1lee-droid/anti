function escapeJsonBackslashes(str) {
  let result = '';
  let inString = false;
  let i = 0;
  
  const latexCommands = [
    'newline', 'nabla', 'nu', 'theta', 'tau', 'tan', 'times', 'tilde', 'text', 
    'rho', 'right', 'mathrm', 'rule', 'beta', 'bar', 'begin', 'frac', 'phi', 'varphi', 'forall'
  ];

  while (i < str.length) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
    } else if (inString && char === '\\') {
      const next = str[i + 1];
      
      if (next === '"' || next === '/' || next === '\\') {
        result += char + next;
        i += 2;
      } else if (next === 'n' || next === 't' || next === 'r' || next === 'b' || next === 'f') {
        // Extract the sequence of letters following the backslash to see if it is a LaTeX command
        let tempIndex = i + 1;
        let commandWord = '';
        while (tempIndex < str.length && /[a-zA-Z]/.test(str[tempIndex])) {
          commandWord += str[tempIndex];
          tempIndex++;
        }
        
        // If the commandWord starts with one of our known LaTeX commands, we treat it as a LaTeX command (and escape it)
        const isLatex = latexCommands.some(cmd => commandWord.startsWith(cmd));
        if (isLatex) {
          result += '\\\\';
          i++;
        } else {
          // Otherwise, it is a standard JSON control char like \n or \t
          result += char + next;
          i += 2;
        }
      } else {
        // Any other character (e.g. \gamma, \sigma, \alpha, \cdot, \sqrt, or non-letters like \()
        result += '\\\\';
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}

const testCases = [
  '{"question": "완전보상 q = \\gamma \\cdot D_f의 경우", "hint": "use \\theta", "quote": "He said \\"hello\\""}',
  '{"text": "Line 1\\nLine 2\\n1. \\theta\\n2. \\nu\\n3. \\newline"}',
  '{"text": "Tab\\tTest\\tand \\tau and \\tan"}',
  '{"text": "Poisson ratio \\nu = 0.3\\nAnother line"}'
];

testCases.forEach((tc, idx) => {
  console.log(`--- Test Case ${idx + 1} ---`);
  console.log("Raw JSON:", tc);
  try {
    const escaped = escapeJsonBackslashes(tc);
    console.log("Escaped JSON:", escaped);
    const parsed = JSON.parse(escaped);
    console.log("Parsed Object:", parsed);
    console.log("Newline check (contains real newline):", parsed.text ? parsed.text.includes('\n') : "N/A");
  } catch (e) {
    console.error("Failed to parse:", e.message);
  }
});
