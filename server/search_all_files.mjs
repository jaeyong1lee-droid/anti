import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceDir = path.resolve(__dirname, '..');

function walkDir(dir) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    if (f === 'node_modules' || f === '.git' || f === '.node_portable' || f === '.vercel' || f === 'backups') return;
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath);
    } else {
      if (f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.json') || f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.html') || f.endsWith('.css') || f.endsWith('.mjs')) {
        try {
          const content = fs.readFileSync(dirPath, 'utf8');
          if (content.includes('암반 지지력') || content.includes('암반 지지력 해설 보고서')) {
            console.log(`Found in: ${path.relative(workspaceDir, dirPath)}`);
          }
        } catch (e) {}
      }
    }
  });
}

walkDir(workspaceDir);
console.log('Search finished.');
