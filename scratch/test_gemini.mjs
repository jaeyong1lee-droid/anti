import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', 'server', '.env') });

async function test() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('No GEMINI_API_KEY found in server/.env');
    return;
  }
  console.log('Using API Key (masked):', key.substring(0, 8) + '...' + key.substring(key.length - 4));
  
  try {
    const genAI = new GoogleGenerativeAI(key.trim());
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent('Hello! Respond in 3 words.');
    console.log('Response:', result.response.text());
  } catch (err) {
    console.error('Gemini API call failed:', err);
  }
}

test();
