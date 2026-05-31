import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8').replace(/\r\n/g, '\n');

const startIndex = content.indexOf("app.post('/api/formula/suggest-title'");
const nextRouteIndex = content.indexOf("// 7. Get Topic File");
console.log('=== FULL SUGGEST-TITLE ===');
console.log(content.substring(startIndex, nextRouteIndex));
console.log('=== END ===');
