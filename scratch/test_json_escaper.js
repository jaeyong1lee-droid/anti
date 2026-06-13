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
      if (str[i + 1] === '"') {
        result += '\\"';
        i += 2;
      } else if (str[i + 1] === '\\') {
        result += '\\\\\\\\';
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

const rawJson = '{"question": "완전보상 q = \\gamma \\cdot D_f의 경우", "hint": "use \\theta", "quote": "He said \\"hello\\""}';
console.log("Raw JSON:", rawJson);
const escaped = escapeJsonBackslashes(rawJson);
console.log("Escaped JSON:", escaped);
const parsed = JSON.parse(escaped);
console.log("Parsed Object:", parsed);
