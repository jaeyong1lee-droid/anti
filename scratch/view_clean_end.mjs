import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8').replace(/\r\n/g, '\n');

const startIndex = content.indexOf("app.post('/api/formula/suggest-title'");
const nextRouteIndex = content.indexOf("// 7. Get Topic File");
console.log('=== CLEAN END PART ===');
console.log(content.substring(nextRouteIndex - 200, nextRouteIndex));
console.log('=== END ===');
