import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function test() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('No GEMINI_API_KEY found!');
    return;
  }
  
  const modelName = 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key.trim()}`;
  
  console.log(`Sending direct generateContent request to ${url}...`);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say hello in 3 words' }] }]
      })
    });
    
    console.log('Status code:', response.status);
    console.log('Status text:', response.statusText);
    const body = await response.json();
    console.log('Response body:', JSON.stringify(body, null, 2));
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

test();
