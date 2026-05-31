import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const routeSignature = "app.post('/api/formula/suggest-title'";
const startIndex = content.indexOf(routeSignature);
if (startIndex === -1) {
  console.error("Could not find suggest-title route start!");
  process.exit(1);
}

const braceStartIdx = content.indexOf('{', startIndex);
if (braceStartIdx === -1) {
  console.error("Could not find opening brace!");
  process.exit(1);
}

let braceCount = 1;
let currentIndex = braceStartIdx + 1;
while (braceCount > 0 && currentIndex < content.length) {
  const char = content[currentIndex];
  if (char === '{') {
    braceCount++;
  } else if (char === '}') {
    braceCount--;
  }
  currentIndex++;
}

if (braceCount > 0) {
  console.error("Braces unbalanced!");
  process.exit(1);
}

const endRouteIndex = currentIndex;
console.log('Brace matching succeeded! Start:', startIndex, 'End:', endRouteIndex);
const routeBlock = content.substring(startIndex, endRouteIndex);
console.log('=== ROUTE BLOCK ===');
console.log(routeBlock);
console.log('=== END ===');
