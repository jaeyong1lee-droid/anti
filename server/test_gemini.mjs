import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function test() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('No GEMINI_API_KEY found in server/.env');
    return;
  }
  
  const genAI = new GoogleGenerativeAI(key.trim());
  const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];
  for (const modelName of models) {
    try {
      console.log(`\n--- Testing ${modelName} ---`);
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });
      const result = await model.generateContent("Hello, say 'yes' if you can hear me.");
      console.log(`Response:`, result.response.text());
    } catch (err) {
      console.error(`Failed with ${modelName}:`, err.message);
    }
  }
}

test();
