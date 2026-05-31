import fs from 'fs';
import path from 'path';

const appJsxPath = path.resolve('client/src/App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8');

const lines = content.replace(/\r\n/g, '\n').split('\n');

// Print lines 4090 to 4100
console.log('Current lines around index 4093:');
for (let i = 4090; i < 4100; i++) {
  console.log(`${i + 1}: [${lines[i]}]`);
}

const line4094Val = lines[4093]; // 0-indexed index 4093 is 1-indexed line 4094
const line4095Val = lines[4094]; // 0-indexed index 4094 is 1-indexed line 4095

if (line4094Val.trim() === '</div>' && line4095Val.trim() === ')}') {
  console.log('Confirmed line values match leftover block. Deleting them!');
  lines.splice(4093, 2);
  fs.writeFileSync(appJsxPath, lines.join('\n'), 'utf8');
  console.log('SUCCESS: Deleted the leftover lines!');
} else {
  console.error('ERROR: Line values do not match!');
}
