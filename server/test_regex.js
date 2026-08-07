const jsonStr = '{"text": "포아송비($\\\\n u$)"}';
console.log('Original jsonStr:', jsonStr);
console.log('Match /\\n/ :', jsonStr.match(/\n/g)); 
console.log('Match /\\\\n/ :', jsonStr.match(/\\n/g)); 

let replaced1 = jsonStr.replace(/\$\\n\s*u/g, '$\\\\nu');
console.log('Replaced with /$\\n/ :', replaced1);

let replaced2 = jsonStr.replace(/\$\\\\n\s*u/g, '$\\\\nu');
console.log('Replaced with /$\\\\n/ :', replaced2);
