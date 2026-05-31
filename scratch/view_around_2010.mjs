import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const lines = content.split('\n');
console.log('=== LINES around 2010 ===');
for (let i = 1990; i < 2040; i++) {
  console.log(`${i}: ${lines[i]}`);
}
