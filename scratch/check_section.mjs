import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const index = content.indexOf("app.post('/api/formula/suggest-title'");
if (index === -1) {
  console.log('Not found suggest-title');
} else {
  console.log('Found suggest-title at:', index);
  const sliced = content.substring(index + 3500, index + 5500);
  console.log('=== SECTION ===');
  console.log(sliced);
  console.log('=== END SECTION ===');
}
