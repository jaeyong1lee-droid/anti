const val = '{"text": "foo \\\\nu bar"}';
const parsed = JSON.parse(val);
console.log('Parsed:', parsed.text);
for(let i=0; i<parsed.text.length; i++) console.log(i, parsed.text[i], parsed.text.charCodeAt(i));
