import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexFile = path.join(__dirname, '..', 'server', 'index.js');
const content = fs.readFileSync(indexFile, 'utf8');
const lines = content.split('\n');

// Lines 5037 to 5046 (1-indexed is indices 5036 to 5045)
const targetLines = lines.slice(5036, 5046).join('\n');
console.log(JSON.stringify(targetLines));
