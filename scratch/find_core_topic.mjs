import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const index = content.indexOf("function isCoreTopic");
if (index === -1) {
  console.log('Not found isCoreTopic');
} else {
  console.log('Found isCoreTopic at:', index);
  console.log(content.substring(index, index + 3000));
}
