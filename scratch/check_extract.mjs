import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

// Find all occurrences of "extractVariablesFromMath"
let index = content.indexOf("extractVariablesFromMath");
let count = 1;
while (index !== -1) {
  console.log(`=== Occurrence #${count} at index ${index} ===`);
  console.log(content.substring(Math.max(0, index - 200), Math.min(content.length, index + 300)));
  index = content.indexOf("extractVariablesFromMath", index + 1);
  count++;
}
