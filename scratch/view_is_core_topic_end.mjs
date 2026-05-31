import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const idx = content.indexOf("searchTarget.includes('여굴')");
if (idx === -1) {
  console.log('Not found');
} else {
  console.log(content.substring(idx, idx + 1800));
}
