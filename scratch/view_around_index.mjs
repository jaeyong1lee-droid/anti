import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const index = 83739;
console.log('=== BEFORE INDEX ===');
console.log(content.substring(index - 500, index));
console.log('=== AFTER INDEX ===');
console.log(content.substring(index, index + 1000));
