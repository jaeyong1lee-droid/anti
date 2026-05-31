import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const index = content.indexOf("app.post('/api/formula/suggest-title'");
if (index === -1) {
  console.log('Not found suggest-title');
} else {
  // Let's search for "res.status(500)" or "서버 오류가 발생했습니다" after this index
  const nextErrIdx = content.indexOf("서버 오류가 발생했습니다", index);
  if (nextErrIdx !== -1) {
    const startDump = nextErrIdx - 200;
    const endDump = nextErrIdx + 200;
    console.log('=== DUMP AROUND ERROR ===');
    console.log(JSON.stringify(content.substring(startDump, endDump)));
    console.log('=== END DUMP ===');
  } else {
    console.log('Not found error text after index');
  }
}
