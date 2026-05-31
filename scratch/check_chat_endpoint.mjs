import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const index = content.indexOf("app.post('/api/chat'");
if (index === -1) {
  console.log('Not found /api/chat');
} else {
  console.log('Found /api/chat at:', index);
  const sliced = content.substring(index, index + 3500);
  console.log('=== SECTION ===');
  console.log(sliced);
  console.log('=== END SECTION ===');
}
