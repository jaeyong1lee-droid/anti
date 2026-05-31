import fs from 'fs';
import path from 'path';

const clientAppPath = path.resolve('client/src/App.jsx');
const content = fs.readFileSync(clientAppPath, 'utf8');

const index = content.indexOf('const filterStructureLinesClient');
if (index === -1) {
  console.log('Not found filterStructureLinesClient');
} else {
  console.log('Found filterStructureLinesClient at:', index);
  const sliced = content.substring(index + 800, index + 2300);
  console.log('=== SECTION ===');
  console.log(sliced);
  console.log('=== END SECTION ===');
}
