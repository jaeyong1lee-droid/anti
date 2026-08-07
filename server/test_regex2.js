const jsonStr = '{"text": "$G = \\\\frac{E}{2(1 + \\\\n u)}$"}';
console.log('Original jsonStr:', jsonStr);
let replaced = jsonStr.replace(/\\n\s*u/g, '\\\\nu');
console.log('Replaced:', replaced);
