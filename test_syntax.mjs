import { pathToFileURL } from 'url';
const serverPath = './server/index.js';
console.log('Attempting to import', serverPath);
try {
  await import(pathToFileURL(serverPath).href);
  console.log('Successfully imported index.js');
  process.exit(0);
} catch (e) {
  console.error('Failed to import:', e);
  process.exit(1);
}
