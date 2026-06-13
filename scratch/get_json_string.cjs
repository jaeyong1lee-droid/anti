const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, '..', 'server', 'index.js');
const content = fs.readFileSync(indexFile, 'utf8');
const lines = content.split('\n');

// Lines 5037 to 5046 (1-indexed is indices 5036 to 5045)
const targetLines = lines.slice(5036, 5046).join('\n');
console.log(JSON.stringify(targetLines));
