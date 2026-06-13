function escapeJsonBackslashes(str) {
  let result = '';
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
    } else if (inString && char === '\\') {
      const next = str[i + 1];
      const next2 = str[i + 2];
      
      if (next === '"' || next === '/' || next === '\\') {
        result += char + next;
        i += 2;
      } else if ((next === 'n' || next === 't' || next === 'r' || next === 'b' || next === 'f') && 
                 (!next2 || !/[a-zA-Z]/.test(next2))) {
        result += char + next;
        i += 2;
      } else {
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
  } catch (e) {
    console.error("Failed to parse:", e.message);
  }
});
