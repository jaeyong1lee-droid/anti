const val = '{"text": "foo \\nu bar"}'; // ONE backslash in JS means newline in the string literal!
// Wait! If the JS file has ONE backslash, it evaluates to newline at compile time!
// So val will have a real newline!
console.log('val length:', val.length);
for(let i=0; i<val.length; i++) console.log(i, val[i], val.charCodeAt(i));
try {
  const parsed = JSON.parse(val);
  console.log('parsed text length:', parsed.text.length);
  for(let i=0; i<parsed.text.length; i++) console.log(i, parsed.text[i], parsed.text.charCodeAt(i));
} catch(e) {
  console.log('Error parsing JSON:', e.message);
}
