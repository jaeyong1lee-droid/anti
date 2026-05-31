import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8').replace(/\r\n/g, '\n');

const idx = 121930;
console.log(JSON.stringify(content.substring(idx - 100, idx + 400)));
