// The DB returns a string containing a literal backslash followed by n
const dbStr = '{"text": "$\\\\n u"}'; 
// To Javascript string parser, '\\\\' evaluates to '\\'
console.log('dbStr:', dbStr);

// To match a literal backslash followed by n, we use /\\\\n/ in regex literal
// which evaluates to regex \n (no wait, \\ evaluates to \, so \\n means \n in regex)
// Wait! If the string contains a backslash, the regex must match a backslash!
// A backslash in regex is \\
// So in a regex literal, it's /\\\\/
// So backslash followed by n in regex literal is /\\\\n/

let replaced = dbStr.replace(/\\\\n\s*u/g, '\\\\nu');
console.log('replaced:', replaced);
const parsed = JSON.parse(replaced);
console.log('parsed:', parsed.text);
for(let i=0; i<parsed.text.length; i++) console.log(i, parsed.text[i]);
