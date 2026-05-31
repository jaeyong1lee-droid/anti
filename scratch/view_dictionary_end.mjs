import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const index = content.indexOf("const LOCAL_FORMULA_DICTIONARY");
if (index === -1) {
  console.log('Not found LOCAL_FORMULA_DICTIONARY');
} else {
  console.log('Found LOCAL_FORMULA_DICTIONARY at:', index);
  // Find the closing brace of LOCAL_FORMULA_DICTIONARY
  const endDictIdx = content.indexOf("];", index);
  console.log('Found ]; at:', endDictIdx);
  console.log(content.substring(endDictIdx - 200, endDictIdx + 800));
}
