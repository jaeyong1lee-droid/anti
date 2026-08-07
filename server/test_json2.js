const before = '{"text": "$\\\\n u"}';
const after = before.replace(/\$\\n\s*u/g, '$\\\\nu');
console.log('after:', after);
const parsed = JSON.parse(after);
console.log('parsed text:', parsed.text);
for(let i=0; i<parsed.text.length; i++) console.log(i, parsed.text[i]);
