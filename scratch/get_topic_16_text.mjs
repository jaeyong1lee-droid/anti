import { dbQuery } from '../server/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple HTML text extractor to mimic server logic
function htmlToPlainText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  try {
    const topic = await dbQuery.get('SELECT * FROM topics WHERE id = 16');
    if (!topic || !topic.pdf_data) {
      console.log('No topic data found');
      return;
    }
    const htmlText = topic.pdf_data.toString('utf-8');
    const plainText = htmlToPlainText(htmlText);
    
    fs.writeFileSync(path.resolve(__dirname, 'topic_16_raw.html'), htmlText);
    fs.writeFileSync(path.resolve(__dirname, 'topic_16_plain.txt'), plainText);
    console.log('Successfully wrote raw and plain texts of topic 16 to scratch directory');
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
