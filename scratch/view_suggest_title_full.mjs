import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const idx = content.indexOf("app.post('/api/formula/suggest-title'");
if (idx === -1) {
  console.log('Not found suggest-title');
} else {
  console.log(content.substring(idx, idx + 3500));
}
