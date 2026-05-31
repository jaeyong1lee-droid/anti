const fs = require('fs');
const path = require('path');

const appJsxPath = path.join(__dirname, '..', 'client', 'src', 'App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8').replace(/\r\n/g, '\n');

const term = "보기별 정밀 분석";
let idx = -1;
while ((idx = content.indexOf(term, idx + 1)) !== -1) {
  console.log(`Found "${term}" at index ${idx}:`);
  console.log(JSON.stringify(content.substring(idx - 100, idx + 200)));
}
