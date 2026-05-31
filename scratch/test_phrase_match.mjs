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

const endPhrase = "Formula suggest title route error";
const endPhraseIndex = content.indexOf(endPhrase);
if (endPhraseIndex === -1) {
  console.error("Could not find end phrase!");
  process.exit(1);
}

const endRouteIndex = content.indexOf("});", endPhraseIndex) + 3;
console.log('Target found! Start:', startIndex, 'End:', endRouteIndex);
const routeBlock = content.substring(startIndex, endRouteIndex);
console.log('=== ROUTE BLOCK ===');
console.log(routeBlock);
console.log('=== END ===');
