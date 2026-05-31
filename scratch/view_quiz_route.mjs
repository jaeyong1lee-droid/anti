import fs from 'fs';
import path from 'path';

const serverIndexPath = path.resolve('server/index.js');
const content = fs.readFileSync(serverIndexPath, 'utf8');

const index = content.indexOf("app.get('/api/topics/:id/ai-questions'");
if (index === -1) {
  // Let's search for "topics/:id/ai-questions"
  const idx2 = content.indexOf("topics/:id/ai-questions");
  console.log('topics/:id/ai-questions found at:', idx2);
  console.log(content.substring(idx2 - 200, idx2 + 1500));
} else {
  console.log('Found route at:', index);
  console.log(content.substring(index - 200, index + 1500));
}
