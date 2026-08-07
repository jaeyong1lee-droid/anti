const val = '{"text": "foo \\\\\\\\nu bar"}'; // 4 backslashes in JS means \\ in string!
console.log('val length:', val.length);
for(let i=0; i<val.length; i++) console.log(i, val[i], val.charCodeAt(i));
const parsed = JSON.parse(val);
console.log('parsed text length:', parsed.text.length);
for(let i=0; i<parsed.text.length; i++) console.log(i, parsed.text[i], parsed.text.charCodeAt(i));
