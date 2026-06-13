const sym = 'gamma';
const regex = new RegExp(`(?<!\\\\)\\b${sym}\\b`, 'g');
console.log('regex:', regex.toString());
