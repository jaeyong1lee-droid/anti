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

const raw = '{"question": "Line 1\\nLine 2\\tTabbed\\rReturn"}';
console.log("Raw JSON:", raw);
const escaped = escapeJsonBackslashes(raw);
console.log("Escaped JSON:", escaped);
const parsed = JSON.parse(escaped);
console.log("Parsed Object:", parsed);
console.log("Has real newline:", parsed.question.includes('\n'));
console.log("Has real tab:", parsed.question.includes('\t'));
