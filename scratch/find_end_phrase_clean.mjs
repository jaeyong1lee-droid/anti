import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8').replace(/\r\n/g, '\n');

const idx = content.indexOf("Formula suggest title route error");
if (idx === -1) {
  // Let's search for "suggest-title" route ending text
  const idx2 = content.indexOf("app.post('/api/formula/suggest-title'");
  if (idx2 !== -1) {
    const endPart = content.substring(idx2 + 1000, idx2 + 3500);
    console.log('=== END SECTION OF SUGGEST-TITLE ===');
    console.log(endPart);
  }
} else {
  console.log('Found "Formula suggest title route error" at:', idx);
  console.log(content.substring(idx - 100, idx + 300));
}
