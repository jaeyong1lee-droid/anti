import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

async function test() {
  const envContent = fs.readFileSync('.env', 'utf8');
  let key = '';
  for (const line of envContent.split('\n')) {
    if (line.startsWith('GEMINI_API_KEY=')) {
      key = line.split('=')[1].trim();
      break;
    }
  }
  
  const genAI = new GoogleGenerativeAI(key);
  const models = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-2.0-flash-lite'
  ];
  for (const modelName of models) {
    try {
      console.log(`\n--- Testing ${modelName} ---`);
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });
      const result = await model.generateContent("Hello, say 'yes' if you can hear me.");
      console.log(`Response:`, result.response.text().trim());
    } catch (err) {
      console.error(`Failed with ${modelName}:`, err.message);
    }
  }
}
test();
